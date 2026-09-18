import { Hono } from "hono";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  db,
  projects,
  servers,
  secrets,
  deploys,
  deploySteps,
  databases,
  notificationChannels,
  alertState,
  encryptSecret,
  decryptSecret,
} from "@argo/db";
import {
  createProjectInputSchema,
  upsertSecretsInputSchema,
  setChannelInputSchema,
  DEPLOY_STEP_NAMES,
  type SecretSummary,
  type NotificationChannelSummary,
} from "@argo/shared-types";
import { deployRunQueue, dbProvisionQueue } from "@argo/queue";
import { requireAuth } from "../lib/require-auth";
import { getUserGithubToken } from "../lib/user-github-token";
import { detectFramework } from "../lib/framework-detect";
import { uniqueProjectSlug } from "../lib/slug";
import { getFileContent } from "../lib/github";
import { parseEnvExampleKeys } from "../lib/parse-env-example";
import { toDeploySummary } from "../lib/deploy-dto";
import type { AppEnv } from "../types";

export const projectsRoute = new Hono<AppEnv>();
projectsRoute.use("*", requireAuth);

function toProjectDTO(project: typeof projects.$inferSelect) {
  return {
    id: project.id,
    name: project.name,
    subdomain: project.subdomain,
    githubRepo: project.githubRepo,
    githubBranch: project.githubBranch,
    framework: project.framework,
    status: project.status,
    serverId: project.serverId,
    createdAt: project.createdAt,
  };
}

projectsRoute.get("/", async (c) => {
  const userId = c.get("userId");
  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.createdAt));
  return c.json(rows.map(toProjectDTO));
});

async function getOwnedProject(userId: string, projectId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
  return project ?? null;
}

projectsRoute.get("/:id", async (c) => {
  const project = await getOwnedProject(c.get("userId"), c.req.param("id"));
  if (!project) return c.json({ error: "not found" }, 404);
  return c.json(toProjectDTO(project));
});

projectsRoute.post("/", async (c) => {
  const userId = c.get("userId");
  const parsed = createProjectInputSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: "invalid input", issues: parsed.error.issues }, 400);
  }
  const input = parsed.data;

  const [server] = await db
    .select()
    .from(servers)
    .where(and(eq(servers.id, input.serverId), eq(servers.userId, userId)));
  if (!server) return c.json({ error: "server not found" }, 404);
  if (server.status !== "connected") {
    return c.json({ error: "this server isn't connected yet" }, 400);
  }

  const token = await getUserGithubToken(userId);
  if (!token) return c.json({ error: "no GitHub token on file — sign in again" }, 400);

  // Validated by createProjectInputSchema's regex, so this split is safe.
  const [owner, repo] = input.githubRepo.split("/") as [string, string];

  let framework: Awaited<ReturnType<typeof detectFramework>>;
  try {
    framework = await detectFramework(token, owner, repo, input.githubBranch);
  } catch {
    return c.json({ error: "could not read this repository from GitHub" }, 502);
  }

  const subdomain = await uniqueProjectSlug(input.name);

  const [project] = await db
    .insert(projects)
    .values({
      userId,
      serverId: input.serverId,
      name: input.name,
      subdomain,
      githubRepo: input.githubRepo,
      githubBranch: input.githubBranch,
      framework,
      status: "created",
    })
    .returning();

  if (!project) return c.json({ error: "failed to create project" }, 500);

  // Best-effort: a repo without a .env.example (or a transient GitHub
  // hiccup here) shouldn't fail project creation, which already succeeded.
  try {
    const envExample = await getFileContent(
      token,
      owner,
      repo,
      ".env.example",
      input.githubBranch,
    );
    const keys = envExample ? parseEnvExampleKeys(envExample) : [];
    if (keys.length > 0) {
      await db
        .insert(secrets)
        .values(
          keys.map((key) => ({
            projectId: project.id,
            key,
            value: encryptSecret(""),
            source: "user" as const,
          })),
        )
        .onConflictDoNothing();
    }
  } catch {
    // ignored — see comment above
  }

  return c.json(toProjectDTO(project), 201);
});

// ---------------------------------------------------------------------------
// secrets — detected from .env.example at project creation, filled in here.
// The list endpoint never returns decrypted values; reveal is a separate,
// explicit, single-key request (see docs/PHASE1_DESIGN.md PR4 notes).
// ---------------------------------------------------------------------------

projectsRoute.get("/:id/secrets", async (c) => {
  const project = await getOwnedProject(c.get("userId"), c.req.param("id"));
  if (!project) return c.json({ error: "not found" }, 404);

  const rows = await db
    .select()
    .from(secrets)
    .where(eq(secrets.projectId, project.id))
    .orderBy(asc(secrets.key));

  const body: SecretSummary[] = rows.map((row) => ({
    key: row.key,
    source: row.source,
    hasValue: decryptSecret(row.value).length > 0,
  }));
  return c.json(body);
});

projectsRoute.get("/:id/secrets/:key/reveal", async (c) => {
  const project = await getOwnedProject(c.get("userId"), c.req.param("id"));
  if (!project) return c.json({ error: "not found" }, 404);

  const [row] = await db
    .select()
    .from(secrets)
    .where(and(eq(secrets.projectId, project.id), eq(secrets.key, c.req.param("key"))));
  if (!row) return c.json({ error: "not found" }, 404);

  return c.json({ key: row.key, value: decryptSecret(row.value) });
});

projectsRoute.put("/:id/secrets", async (c) => {
  const project = await getOwnedProject(c.get("userId"), c.req.param("id"));
  if (!project) return c.json({ error: "not found" }, 404);

  const parsed = upsertSecretsInputSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: "invalid input", issues: parsed.error.issues }, 400);
  }

  for (const { key, value } of parsed.data.secrets) {
    await db
      .insert(secrets)
      .values({ projectId: project.id, key, value: encryptSecret(value), source: "user" })
      .onConflictDoUpdate({
        target: [secrets.projectId, secrets.key],
        set: { value: encryptSecret(value), updatedAt: new Date() },
      });
  }

  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// deploys — one manual "Deploy" button in Phase 1 (no auto-deploy-on-push,
// no rollback). See docs/PHASE1_DESIGN.md sections 4/5 for the pipeline.
// ---------------------------------------------------------------------------

projectsRoute.get("/:id/deploys", async (c) => {
  const project = await getOwnedProject(c.get("userId"), c.req.param("id"));
  if (!project) return c.json({ error: "not found" }, 404);

  const deployRows = await db
    .select()
    .from(deploys)
    .where(eq(deploys.projectId, project.id))
    .orderBy(desc(deploys.createdAt));

  const summaries = await Promise.all(
    deployRows.map(async (deploy) => {
      const steps = await db
        .select()
        .from(deploySteps)
        .where(eq(deploySteps.deployId, deploy.id))
        .orderBy(asc(deploySteps.orderIndex));
      return toDeploySummary(deploy, steps);
    }),
  );

  return c.json(summaries);
});

projectsRoute.post("/:id/deploys", async (c) => {
  const project = await getOwnedProject(c.get("userId"), c.req.param("id"));
  if (!project) return c.json({ error: "not found" }, 404);

  if (!project.framework) {
    return c.json(
      { error: "this project's framework isn't supported yet — nothing to deploy" },
      400,
    );
  }
  if (project.status === "deploying") {
    return c.json({ error: "a deploy is already in progress for this project" }, 409);
  }

  const [deploy] = await db
    .insert(deploys)
    .values({ projectId: project.id, status: "queued" })
    .returning();
  if (!deploy) return c.json({ error: "failed to create deploy" }, 500);

  await db.insert(deploySteps).values(
    DEPLOY_STEP_NAMES.map((name, orderIndex) => ({
      deployId: deploy.id,
      name,
      orderIndex,
      status: "pending" as const,
    })),
  );

  await db
    .update(projects)
    .set({ status: "deploying", updatedAt: new Date() })
    .where(eq(projects.id, project.id));

  await deployRunQueue().add("deploy", { deployId: deploy.id });

  const steps = await db
    .select()
    .from(deploySteps)
    .where(eq(deploySteps.deployId, deploy.id))
    .orderBy(asc(deploySteps.orderIndex));

  return c.json(toDeploySummary(deploy, steps), 201);
});

// ---------------------------------------------------------------------------
// databases — one Postgres per project in Phase 1. Provisioning writes
// DATABASE_URL into secrets (source "system") once it succeeds; picking
// that up means redeploying, same as any other secret change.
// ---------------------------------------------------------------------------

function toDatabaseDTO(database: typeof databases.$inferSelect) {
  return {
    id: database.id,
    type: database.type,
    status: database.status,
    connectionSecretKey: database.connectionSecretKey,
    createdAt: database.createdAt,
  };
}

projectsRoute.get("/:id/databases", async (c) => {
  const project = await getOwnedProject(c.get("userId"), c.req.param("id"));
  if (!project) return c.json({ error: "not found" }, 404);

  const rows = await db.select().from(databases).where(eq(databases.projectId, project.id));
  return c.json(rows.map(toDatabaseDTO));
});

projectsRoute.post("/:id/databases", async (c) => {
  const project = await getOwnedProject(c.get("userId"), c.req.param("id"));
  if (!project) return c.json({ error: "not found" }, 404);

  const [existing] = await db
    .select()
    .from(databases)
    .where(eq(databases.projectId, project.id));
  if (existing) {
    return c.json({ error: "this project already has a database" }, 409);
  }

  const [server] = await db.select().from(servers).where(eq(servers.id, project.serverId));
  if (!server || server.status !== "connected") {
    return c.json({ error: "this server isn't connected yet" }, 400);
  }

  const [database] = await db
    .insert(databases)
    .values({
      projectId: project.id,
      type: "postgres",
      containerName: `argo-db-${project.subdomain}`,
      connectionSecretKey: "DATABASE_URL",
      status: "provisioning",
    })
    .returning();
  if (!database) return c.json({ error: "failed to create database" }, 500);

  await dbProvisionQueue().add("provision", { projectId: project.id });

  return c.json(toDatabaseDTO(database), 201);
});

// ---------------------------------------------------------------------------
// notification channel — one Slack webhook per project, Phase 1's only
// channel type. Never returned once set, same posture as secrets: the
// list/get endpoint says whether one's configured, not what it is.
// ---------------------------------------------------------------------------

projectsRoute.get("/:id/channel", async (c) => {
  const project = await getOwnedProject(c.get("userId"), c.req.param("id"));
  if (!project) return c.json({ error: "not found" }, 404);

  const [channel] = await db
    .select()
    .from(notificationChannels)
    .where(eq(notificationChannels.projectId, project.id));

  const body: NotificationChannelSummary = { configured: !!channel };
  return c.json(body);
});

projectsRoute.put("/:id/channel", async (c) => {
  const project = await getOwnedProject(c.get("userId"), c.req.param("id"));
  if (!project) return c.json({ error: "not found" }, 404);

  const parsed = setChannelInputSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: "invalid input", issues: parsed.error.issues }, 400);
  }

  await db
    .insert(notificationChannels)
    .values({
      projectId: project.id,
      type: "slack",
      webhookUrl: encryptSecret(parsed.data.webhookUrl),
    })
    .onConflictDoUpdate({
      target: notificationChannels.projectId,
      set: { webhookUrl: encryptSecret(parsed.data.webhookUrl) },
    });

  const body: NotificationChannelSummary = { configured: true };
  return c.json(body);
});

// ---------------------------------------------------------------------------
// health — the traffic-light status the health-check sweep (PR7, worker)
// maintains for every live project.
// ---------------------------------------------------------------------------

projectsRoute.get("/:id/health", async (c) => {
  const project = await getOwnedProject(c.get("userId"), c.req.param("id"));
  if (!project) return c.json({ error: "not found" }, 404);

  const [row] = await db
    .select()
    .from(alertState)
    .where(eq(alertState.projectId, project.id));

  return c.json({
    isHealthy: row?.isHealthy ?? null,
    lastCheckedAt: row?.lastCheckedAt ?? null,
  });
});
