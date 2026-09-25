import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { db, servers, encryptSecret, recordAudit } from "@deplyr/db";
import { metricsRangeSchema, registerServerInputSchema, updateServerInputSchema } from "@deplyr/shared-types";
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

// Renames, and/or fixes a bad IP or SSH credential. Touching ipAddress or
// credential re-runs the install job — that's the one supported way to
// retry a server stuck in "error" (e.g. an unparseable private key) without
// deleting and re-registering it.
serversRoute.patch("/:id", async (c) => {
  const userId = c.get("userId");
  const parsed = updateServerInputSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: "invalid input", issues: parsed.error.issues }, 400);
  }
  const input = parsed.data;

  const [existing] = await db
    .select()
    .from(servers)
    .where(and(eq(servers.id, c.req.param("id")), eq(servers.userId, userId)));
  if (!existing) return c.json({ error: "not found" }, 404);

  const retrying = input.ipAddress !== undefined || input.credential !== undefined;

  const [updated] = await db
    .update(servers)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.ipAddress !== undefined ? { ipAddress: input.ipAddress } : {}),
      ...(input.credential !== undefined
        ? {
            sshCredential: encryptSecret(input.credential),
            sshCredentialType: input.credentialType ?? existing.sshCredentialType,
          }
        : {}),
      ...(retrying
        ? { status: "pending" as const, statusDetail: null, dockerInstalled: false, agentConnectedAt: null }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(servers.id, existing.id))
    .returning();

  if (!updated) return c.json({ error: "failed to update server" }, 500);

  if (retrying) {
    await serverInstallQueue().add("install", { serverId: updated.id });
  }

  await recordAudit({
    ownerId: userId,
    serverId: updated.id,
    action: retrying ? "server.reconnect" : "server.update",
    status: "success",
    summary: retrying ? `Retrying connection to ${updated.name}` : `Updated ${updated.name}`,
    resourceType: "server",
    resourceId: updated.id,
    resourceName: updated.name,
  });

  return c.json(toServerDTO(updated));
});

// Re-runs the install job with the credential already on file — for when
// the fix wasn't the credential itself (e.g. the box's authorized_keys was
// updated out of band, like the Instance Connect workaround) and there's
// nothing to change, just to retry.
serversRoute.post("/:id/retry", async (c) => {
  const userId = c.get("userId");
  const [existing] = await db
    .select()
    .from(servers)
    .where(and(eq(servers.id, c.req.param("id")), eq(servers.userId, userId)));
  if (!existing) return c.json({ error: "not found" }, 404);

  const [updated] = await db
    .update(servers)
    .set({ status: "pending", statusDetail: null, dockerInstalled: false, agentConnectedAt: null, updatedAt: new Date() })
    .where(eq(servers.id, existing.id))
    .returning();
  if (!updated) return c.json({ error: "failed to update server" }, 500);

  await serverInstallQueue().add("install", { serverId: updated.id });

  await recordAudit({
    ownerId: userId,
    serverId: updated.id,
    action: "server.reconnect",
    status: "success",
    summary: `Retrying connection to ${updated.name}`,
    resourceType: "server",
    resourceId: updated.id,
    resourceName: updated.name,
  });

  return c.json(toServerDTO(updated));
});

serversRoute.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const [existing] = await db
    .select()
    .from(servers)
    .where(and(eq(servers.id, c.req.param("id")), eq(servers.userId, userId)));
  if (!existing) return c.json({ error: "not found" }, 404);

  // Audit row first: audit_events.server_id is ON DELETE SET NULL, so this
  // entry survives the cascade below and still shows in the account's
  // activity log with the server's name recorded in resourceName.
  await recordAudit({
    ownerId: userId,
    serverId: existing.id,
    action: "server.delete",
    status: "success",
    summary: `Deleted server ${existing.name}`,
    detail: existing.ipAddress,
    resourceType: "server",
    resourceId: existing.id,
    resourceName: existing.name,
  });

  // Cascades to server_metrics, projects (and its secrets/deploys/domains)
  // and databases (and their metrics) — see packages/db/src/schema.ts.
  await db.delete(servers).where(eq(servers.id, existing.id));

  return c.json({ ok: true });
});
