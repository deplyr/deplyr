import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db, servers } from "@deplyr/db";
import { requireAuth } from "../lib/require-auth";
import { listAudit, parseCategory } from "../lib/audit-query";
import type { AppEnv } from "../types";

const query = (c: { req: { query: (k: string) => string | undefined } }) => ({
  category: parseCategory(c.req.query("category")),
  limit: c.req.query("limit") ? Number(c.req.query("limit")) : undefined,
  before: c.req.query("before"),
  resourceId: /^[0-9a-f-]{36}$/i.test(c.req.query("resourceId") ?? "") ? c.req.query("resourceId") : undefined,
});

/** GET /activity — everything across all of the user's servers. */
export const activityRoute = new Hono<AppEnv>();
activityRoute.use("*", requireAuth);
activityRoute.get("/", async (c) => c.json(await listAudit({ ownerId: c.get("userId"), ...query(c) })));

/** GET /servers/:id/activity — one server's log. */
export const serverActivityRoute = new Hono<AppEnv>();
serverActivityRoute.use("*", requireAuth);
serverActivityRoute.get("/:id/activity", async (c) => {
  const userId = c.get("userId");
  const [server] = await db
    .select({ id: servers.id })
    .from(servers)
    .where(and(eq(servers.id, c.req.param("id")), eq(servers.userId, userId)));
  if (!server) return c.json({ error: "not found" }, 404);

  return c.json(await listAudit({ ownerId: userId, serverId: server.id, ...query(c) }));
});
