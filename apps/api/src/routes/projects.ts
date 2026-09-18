import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { db, projects, servers } from "@argo/db";
import { createProjectInputSchema } from "@argo/shared-types";
import { requireAuth } from "../lib/require-auth";
import { getUserGithubToken } from "../lib/user-github-token";
import { detectFramework } from "../lib/framework-detect";
import { uniqueProjectSlug } from "../lib/slug";
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

projectsRoute.get("/:id", async (c) => {
  const userId = c.get("userId");
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, c.req.param("id")), eq(projects.userId, userId)));
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

  return c.json(toProjectDTO(project), 201);
});
