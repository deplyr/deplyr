import type { Job } from "bullmq";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, databases, servers, secrets, encryptSecret, decryptSecret, recordAudit } from "@deplyr/db";
import type { DbProvisionJob } from "@deplyr/queue";
import { buildConnectionString, type DbProvisionPayload } from "@deplyr/shared-types";
import { runAgentCommand } from "../lib/agent-commands";

// Pulling the image is the slow part; a cold Postgres pull can take minutes
// on a small VPS, so this is deliberately more generous than a deploy step.
const PROVISION_TIMEOUT_MS = 15 * 60 * 1000;

// Docker's wording is accurate but noisy (container ids, driver names).
// Recognise the failures people actually hit and say what to do about them.
function friendlyReason(detail: string, port: number | null): string {
  if (/port is already allocated|address already in use/i.test(detail)) {
    return `Port ${port ?? ""} is already in use on this server. Delete this database and recreate it on a different port.`.replace("Port  ", "That port ");
  }
  if (/no such image|manifest unknown|pull access denied/i.test(detail)) {
    return "The server couldn't download the database image. Check that it can reach Docker Hub.";
  }
  if (/no space left/i.test(detail)) {
    return "The server is out of disk space.";
  }
  return detail;
}

async function fail(databaseId: string, detail: string, port: number | null = null) {
  const reason = friendlyReason(detail, port).slice(0, 500);
  const [row] = await db
    .update(databases)
    .set({ status: "error", statusDetail: reason })
    .where(eq(databases.id, databaseId))
    .returning();
  if (!row) return;
  const [server] = await db.select().from(servers).where(eq(servers.id, row.serverId));
  if (server) {
    await recordAudit({
      ownerId: server.userId,
      serverId: row.serverId,
      actor: "system",
      action: "database.provision",
      status: "failure",
      summary: `Couldn't create database ${row.name}`,
      detail: reason,
      resourceType: "database",
      resourceId: row.id,
      resourceName: row.name,
    });
  }
}

/** Provisions one database container. The `databases` row (with its port)
 * already exists — the API creates it before enqueueing, same pattern as
 * deploy-run — and this job is safe to retry: the password is generated once
 * and reused. */
export async function processDbProvision(job: Job<DbProvisionJob>) {
  const { databaseId } = job.data;

  const [database] = await db.select().from(databases).where(eq(databases.id, databaseId));
  if (!database) {
    console.error(`[worker] db:provision — database ${databaseId} not found`);
    return;
  }

  const [server] = await db.select().from(servers).where(eq(servers.id, database.serverId));
  if (!server || server.status !== "connected") {
    await fail(databaseId, "The server isn't connected — reconnect it, then delete and recreate this database.");
    return;
  }
  if (!database.port) {
    await fail(databaseId, "No port was allocated for this database.");
    return;
  }

  const password = database.passwordEncrypted
    ? decryptSecret(database.passwordEncrypted)
    : randomBytes(24).toString("base64url");
  if (!database.passwordEncrypted) {
    await db
      .update(databases)
      .set({ passwordEncrypted: encryptSecret(password) })
      .where(eq(databases.id, databaseId));
  }

  const cfg = database.config;
  const payload: DbProvisionPayload = {
    databaseId,
    type: database.type,
    containerName: database.containerName,
    version: database.version,
    port: database.port,
    password,
    memoryLimitMb: database.memoryLimitMb,
    ...(database.type === "postgres"
      ? { postgres: { dbName: String(cfg.dbName ?? "app"), username: String(cfg.username ?? "app") } }
      : { redis: { policy: String(cfg.policy ?? "allkeys-lru"), persistence: String(cfg.persistence ?? "none") } }),
  };

  try {
    await runAgentCommand({
      serverId: server.id,
      name: "db.provision",
      payload: payload as unknown as Record<string, unknown>,
      onLog: () => {},
      timeoutMs: PROVISION_TIMEOUT_MS,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await fail(databaseId, message, database.port);
    console.error(`[worker] db:provision failed for ${databaseId}: ${message}`);
    return;
  }

  await db
    .update(databases)
    .set({ status: "running", statusDetail: null })
    .where(eq(databases.id, databaseId));
  await recordAudit({
    ownerId: server.userId,
    serverId: server.id,
    actor: "system",
    action: "database.provision",
    status: "success",
    summary: `Database ${database.name} is running`,
    detail: `${database.type === "redis" ? "Redis" : "PostgreSQL"} ${database.version} on port ${database.port}`,
    resourceType: "database",
    resourceId: database.id,
    resourceName: database.name,
  });

  // Linked to a project: hand it the connection string as a system secret,
  // the same way the original one-database-per-project flow did.
  if (database.projectId) {
    const connectionString = buildConnectionString(database.type, {
      host: "127.0.0.1",
      port: database.port,
      username: typeof cfg.username === "string" ? cfg.username : null,
      dbName: typeof cfg.dbName === "string" ? cfg.dbName : null,
      password,
    });
    await db
      .insert(secrets)
      .values({
        projectId: database.projectId,
        key: database.connectionSecretKey,
        value: encryptSecret(connectionString),
        source: "system",
      })
      .onConflictDoUpdate({
        target: [secrets.projectId, secrets.key],
        set: { value: encryptSecret(connectionString), source: "system", updatedAt: new Date() },
      });
  }
}
