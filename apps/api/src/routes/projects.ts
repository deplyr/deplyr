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
  alertState,
  encryptSecret,
  decryptSecret,
  recordAudit,
  syncCaddy,
} from "@deplyr/db";
import {
  createProjectInputSchema,
  updateProjectInputSchema,
  updateProjectSettingsInputSchema,
  upsertSecretsInputSchema,
  DEPLOY_STEP_NAMES,
  type SecretSummary,
} from "@deplyr/shared-types";
import { deployRunQueue } from "@deplyr/queue";
import { createDatabase } from "../lib/create-database";
import { toDatabaseDTO } from "../lib/database-dto";
import { requireAuth } from "../lib/require-auth";
import { getUserGithubToken } from "../lib/user-github-token";
import { detectProject } from "../lib/framework-detect";
import { uniqueProjectSlug } from "../lib/slug";
import { getFileContent, GithubAuthError } from "../lib/github";
import { invalidateGithubSession } from "../lib/github-auth-guard";
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
    settings: project.settings,
    appPort: project.appPort,
    defaultDomainHttps: project.defaultDomainHttps,
    defaultDomainCheckedAt: project.defaultDomainCheckedAt ? project.defaultDomainCheckedAt.toISOString() : null,
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

  let detected: Awaited<ReturnType<typeof detectProject>>;
  try {
    detected = await detectProject(token, owner, repo, input.githubBranch, input.rootDir ?? "");
  } catch (err) {
    if (err instanceof GithubAuthError) return invalidateGithubSession(c, userId);
    return c.json({ error: "could not read this repository from GitHub" }, 502);
  }
  const framework = detected.framework;

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
      // What detection found — package manager, Node version, commands —
      // becomes the project's editable settings.
      settings: framework ? detected.settings : input.rootDir ? { rootDir: input.rootDir } : {},
      status: "created",
    })
    .returning();

  if (!project) return c.json({ error: "failed to create project" }, 500);

  // Best-effort: a repo without a .env.example (or a transient GitHub
  // hiccup here) shouldn't fail project creation, which already succeeded.
  // .env.example lives next to the app, not necessarily the repo root — for
  // a monorepo project that's rootDir (e.g. "backend/.env.example").
  try {
    const rootDir = input.rootDir?.trim().replace(/^\/+|\/+$/g, "");
    const envExamplePath = rootDir ? `${rootDir}/.env.example` : ".env.example";
    const envExample = await getFileContent(
      token,
      owner,
      repo,
      envExamplePath,
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

  await recordAudit({
    ownerId: userId,
    serverId: project.serverId,
    action: "project.create",
    status: "success",
    summary: `Created project ${project.name}`,
    detail: `${project.githubRepo}@${project.githubBranch}`,
    resourceType: "project",
    resourceId: project.id,
    resourceName: project.name,
  });

  return c.json(toProjectDTO(project), 201);
});

// Renames a project. Branch, root directory and the rest of the build
// settings are changed on the settings tab (PUT /:id/settings below) — this
// is just the name/subdomain-adjacent identity, kept separate the same way
// PATCH /servers/:id splits "rename" from "reconnect".
projectsRoute.patch("/:id", async (c) => {
  const userId = c.get("userId");
  const project = await getOwnedProject(userId, c.req.param("id"));
  if (!project) return c.json({ error: "not found" }, 404);

  const parsed = updateProjectInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "invalid input", issues: parsed.error.issues }, 400);
  }
  const name = parsed.data.name.trim();

  const [updated] = await db
    .update(projects)
    .set({ name, updatedAt: new Date() })
    .where(eq(projects.id, project.id))
    .returning();
  if (!updated) return c.json({ error: "failed to rename project" }, 500);

  if (name !== project.name) {
    await recordAudit({
      ownerId: userId,
      serverId: project.serverId,
      action: "project.update",
      status: "success",
      summary: `Renamed ${project.name} to ${name}`,
      resourceType: "project",
      resourceId: project.id,
      resourceName: name,
    });
  }

  return c.json(toProjectDTO(updated));
});

// Deletes the project row, cascading to its secrets, deploys, databases and
// domains (see packages/db/src/schema.ts) — like server delete, this only
// removes Deplyr's record of it. The containers, nginx config and cloned
// source stay on the server until the next deploy of something else at the
// same subdomain overwrites them, or the server itself is cleaned up.
projectsRoute.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const project = await getOwnedProject(userId, c.req.param("id"));
  if (!project) return c.json({ error: "not found" }, 404);

  await recordAudit({
    ownerId: userId,
    serverId: project.serverId,
    action: "project.delete",
    status: "success",
    summary: `Deleted project ${project.name}`,
    detail: `${project.githubRepo}@${project.githubBranch}`,
    resourceType: "project",
    resourceId: project.id,
    resourceName: project.name,
  });

  await db.delete(projects).where(eq(projects.id, project.id));

  // An app on the local server is routed by Caddy — take its route out too.
  if (project.serverId === process.env.DEPLYR_LOCAL_SERVER_ID) {
    syncCaddy().catch((err: unknown) => console.warn("[api] couldn't update Caddy after deleting a project:", err));
  }

  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// build settings — how the project is built and run. Detection proposes; the
// user can override any of it, and it takes effect on the next deploy.
// ---------------------------------------------------------------------------

projectsRoute.post("/:id/detect", async (c) => {
  const userId = c.get("userId");
  const project = await getOwnedProject(userId, c.req.param("id"));
  if (!project) return c.json({ error: "not found" }, 404);

  const token = await getUserGithubToken(userId);
  if (!token) return c.json({ error: "no GitHub token on file — sign in again" }, 400);

  // Optional override so the settings page can preview a different folder
  // before saving it.
  const body = (await c.req.json().catch(() => null)) as { rootDir?: unknown } | null;
  const rootDir = typeof body?.rootDir === "string" ? body.rootDir : (project.settings.rootDir ?? "");
  if (!updateProjectSettingsInputSchema.shape.settings.shape.rootDir.safeParse(rootDir).success) {
    return c.json({ error: "root directory must be a plain relative path" }, 400);
  }

  const [owner, repo] = project.githubRepo.split("/") as [string, string];
  try {
    return c.json(await detectProject(token, owner, repo, project.githubBranch, rootDir));
  } catch (err) {
    if (err instanceof GithubAuthError) return invalidateGithubSession(c, userId);
    return c.json({ error: "could not read this repository from GitHub" }, 502);
  }
});

projectsRoute.put("/:id/settings", async (c) => {
  const userId = c.get("userId");
  const project = await getOwnedProject(userId, c.req.param("id"));
  if (!project) return c.json({ error: "not found" }, 404);
  if (project.status === "deploying") {
    return c.json({ error: "a deploy is running — wait for it to finish, then change settings" }, 409);
  }

  const parsed = updateProjectSettingsInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "invalid input", issues: parsed.error.issues }, 400);
  }
  const { framework, settings } = parsed.data;

  // Drop keys the user left blank so "use the default" stays distinguishable
  // from "skip this step" — for the three commands, only "" means skip and
  // the client sends that deliberately.
  const cleaned = Object.fromEntries(Object.entries(settings).filter(([, v]) => v !== undefined));

  const [updated] = await db
    .update(projects)
    .set({ settings: cleaned, ...(framework ? { framework } : {}), updatedAt: new Date() })
    .where(eq(projects.id, project.id))
    .returning();
  if (!updated) return c.json({ error: "failed to save settings" }, 500);

  await recordAudit({
    ownerId: userId,
    serverId: project.serverId,
    action: "project.settings.update",
    status: "success",
    summary: `Changed build settings for ${project.name}`,
    detail: `Takes effect on the next deploy${framework && framework !== project.framework ? ` · framework ${project.framework ?? "none"} → ${framework}` : ""}`,
    resourceType: "project",
    resourceId: project.id,
    resourceName: project.name,
  });

  return c.json(toProjectDTO(updated));
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

  await recordAudit({
    ownerId: c.get("userId"),
    serverId: project.serverId,
    action: "secret.reveal",
    status: "info",
    summary: `Revealed secret ${row.key} of ${project.name}`,
    resourceType: "project",
    resourceId: project.id,
    resourceName: project.name,
  });

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

  // Which secrets, never their values.
  const keys = parsed.data.secrets.map((x) => x.key);
  await recordAudit({
    ownerId: c.get("userId"),
    serverId: project.serverId,
    action: "secret.update",
    status: "success",
    summary: `Updated ${keys.length} secret${keys.length === 1 ? "" : "s"} for ${project.name}`,
    detail: keys.join(", "),
    resourceType: "project",
    resourceId: project.id,
    resourceName: project.name,
  });

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

  await recordAudit({
    ownerId: c.get("userId"),
    serverId: project.serverId,
    action: "deploy.start",
    status: "info",
    summary: `Started a deploy of ${project.name}`,
    resourceType: "project",
    resourceId: project.id,
    resourceName: project.name,
  });

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

projectsRoute.get("/:id/databases", async (c) => {
  const project = await getOwnedProject(c.get("userId"), c.req.param("id"));
  if (!project) return c.json({ error: "not found" }, 404);

  const rows = await db.select().from(databases).where(eq(databases.projectId, project.id));
  return c.json(rows.map(toDatabaseDTO));
});

projectsRoute.post("/:id/databases", async (c) => {
  const project = await getOwnedProject(c.get("userId"), c.req.param("id"));
  if (!project) return c.json({ error: "not found" }, 404);

  // The one-click button on the project page keeps its original contract:
  // one linked Postgres per project. More than that is managed from the
  // server's Databases tab.
  const [existing] = await db
    .select()
    .from(databases)
    .where(eq(databases.projectId, project.id));
  if (existing) {
    return c.json({ error: "this project already has a database" }, 409);
  }

  const [server] = await db.select().from(servers).where(eq(servers.id, project.serverId));
  if (!server) return c.json({ error: "server not found" }, 404);

  const result = await createDatabase({
    server,
    projectId: project.id,
    input: {
      type: "postgres",
      name: `${project.subdomain}-db`,
      version: "16",
      postgres: { dbName: "app", username: "app" },
    },
  });
  if (!result.ok) return c.json({ error: result.error }, result.status);

  return c.json(toDatabaseDTO(result.database), 201);
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
