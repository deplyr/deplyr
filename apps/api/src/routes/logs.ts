import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db, databases, projects, servers } from "@deplyr/db";
import { requireAuth } from "../lib/require-auth";
import { LogsUnavailableError, fetchContainerLogs, parseTail } from "../lib/container-logs";
import type { AppEnv } from "../types";

/** Container logs for the things Deplyr runs: databases and deployed apps.
 * Read straight from the container on request — nothing is stored. */
export const logsRoute = new Hono<AppEnv>();
// Auth is attached to each route, NOT via logsRoute.use("*"): this router is
// mounted at "/", and a wildcard middleware there would also wrap every route
// registered after it — including the agent WebSocket, which authenticates
// with its own token and would get a 401 instead of an upgrade.

const sinceOf = (raw: string | undefined) => (raw ? raw : undefined);

logsRoute.get("/databases/:id/logs", requireAuth, async (c) => {
  const [row] = await db
    .select({ database: databases })
    .from(databases)
    .innerJoin(servers, eq(databases.serverId, servers.id))
    .where(and(eq(databases.id, c.req.param("id") as string), eq(servers.userId, c.get("userId"))));
  if (!row) return c.json({ error: "not found" }, 404);

  const result = await attempt(() =>
    fetchContainerLogs({
      serverId: row.database.serverId,
      containerName: row.database.containerName,
      tail: parseTail(c.req.query("tail")),
      since: sinceOf(c.req.query("since")),
    }),
  );
  return result.ok ? c.json(result.data) : c.json({ error: result.error }, result.status);
});

logsRoute.get("/projects/:id/logs", requireAuth, async (c) => {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, c.req.param("id") as string), eq(projects.userId, c.get("userId"))));
  if (!project) return c.json({ error: "not found" }, 404);

  const result = await attempt(() =>
    fetchContainerLogs({
      serverId: project.serverId,
      // Same name deploy.start gives the app's container.
      containerName: `deplyr-${project.subdomain}`,
      tail: parseTail(c.req.query("tail")),
      since: sinceOf(c.req.query("since")),
    }),
  );
  return result.ok ? c.json(result.data) : c.json({ error: result.error }, result.status);
});

/** Runs a fetch and turns "the user can act on this" failures into a status + sentence. */
async function attempt<T>(run: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; status: 400 | 502 | 503; error: string }> {
  try {
    return { ok: true, data: await run() };
  } catch (err) {
    if (err instanceof LogsUnavailableError) return { ok: false, status: err.status, error: err.message };
    throw err;
  }
}
