import type { databases } from "@deplyr/db";
import type { DatabaseSummary } from "@deplyr/shared-types";

/** Postgres rows created before config was stored used a fixed app/app pair —
 * fill that in so every reader (UI, credentials, worker) sees the same thing. */
export function resolveConfig(row: typeof databases.$inferSelect): Record<string, string | number> {
  return row.type === "postgres" ? { dbName: "app", username: "app", ...row.config } : row.config;
}

export function toDatabaseDTO(row: typeof databases.$inferSelect): DatabaseSummary {
  return {
    id: row.id,
    serverId: row.serverId,
    projectId: row.projectId,
    name: row.name,
    type: row.type,
    version: row.version,
    port: row.port,
    memoryLimitMb: row.memoryLimitMb,
    containerName: row.containerName,
    status: row.status,
    statusDetail: row.statusDetail,
    connectionSecretKey: row.connectionSecretKey,
    config: resolveConfig(row),
    isUp: row.isUp,
    latencyMs: row.latencyMs,
    stats: row.stats,
    lastCheckedAt: row.lastCheckedAt ? row.lastCheckedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}
