import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { db, servers, encryptSecret, recordAudit } from "@deplyr/db";
import { metricsRangeSchema, registerServerInputSchema } from "@deplyr/shared-types";
import { serverInstallQueue } from "@deplyr/queue";
import { requireAuth } from "../lib/require-auth";
import { getMetricsHistory } from "../lib/server-metrics";
import type { AppEnv } from "../types";

export const serversRoute = new Hono<AppEnv>();
serversRoute.use("*", requireAuth);

// Never send the encrypted SSH credential or the token hash back to the
// browser — this is the only shape a server row should leave the API in.
function toServerDTO(server: typeof servers.$inferSelect) {
  return {
    id: server.id,
    name: server.name,
    ipAddress: server.ipAddress,
    status: server.status,
    statusDetail: server.statusDetail,
    dockerInstalled: server.dockerInstalled,
    agentConnectedAt: server.agentConnectedAt,
    createdAt: server.createdAt,
    cpuPercent: server.cpuPercent,
    memPercent: server.memPercent,
    diskPercent: server.diskPercent,
    metricsUpdatedAt: server.metricsUpdatedAt,
    cpuCores: server.cpuCores,
    memTotalMb: server.memTotalMb,
    diskTotalGb: server.diskTotalGb,
    uptimeSeconds: server.uptimeSeconds,
    loadAvg1: server.loadAvg1,
  };
}

serversRoute.get("/", async (c) => {
  const userId = c.get("userId");
  const rows = await db
    .select()
    .from(servers)
    .where(eq(servers.userId, userId))
    .orderBy(desc(servers.createdAt));
  return c.json(rows.map(toServerDTO));
});

serversRoute.get("/:id", async (c) => {
  const userId = c.get("userId");
  const [server] = await db
    .select()
    .from(servers)
    .where(and(eq(servers.id, c.req.param("id")), eq(servers.userId, userId)));
  if (!server) return c.json({ error: "not found" }, 404);
  return c.json(toServerDTO(server));
});

serversRoute.get("/:id/metrics", async (c) => {
  const userId = c.get("userId");
  const range = metricsRangeSchema.safeParse(c.req.query("range") ?? "1h");
  if (!range.success) return c.json({ error: "invalid range" }, 400);

  const [server] = await db
    .select({ id: servers.id })
    .from(servers)
    .where(and(eq(servers.id, c.req.param("id")), eq(servers.userId, userId)));
  if (!server) return c.json({ error: "not found" }, 404);

  return c.json(await getMetricsHistory(server.id, range.data));
});

serversRoute.post("/", async (c) => {
  const userId = c.get("userId");
  const parsed = registerServerInputSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: "invalid input", issues: parsed.error.issues }, 400);
  }
  const input = parsed.data;

  const [server] = await db
    .insert(servers)
    .values({
      userId,
      name: input.name,
      ipAddress: input.ipAddress,
      sshCredential: encryptSecret(input.credential),
      sshCredentialType: input.credentialType,
      status: "pending",
    })
    .returning();

  if (!server) return c.json({ error: "failed to create server" }, 500);

  await serverInstallQueue().add("install", { serverId: server.id });

  await recordAudit({
    ownerId: userId,
    serverId: server.id,
    action: "server.register",
    status: "success",
    summary: `Registered server ${server.name}`,
    detail: server.ipAddress,
    resourceType: "server",
    resourceId: server.id,
    resourceName: server.name,
  });

  return c.json(toServerDTO(server), 201);
});
