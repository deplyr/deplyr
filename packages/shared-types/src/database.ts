import { z } from "zod";
import { metricsRangeSchema } from "./server";

export const databaseTypeSchema = z.enum(["postgres", "redis"]);
export type DatabaseType = z.infer<typeof databaseTypeSchema>;

export const databaseStatusSchema = z.enum([
  "provisioning",
  "running",
  "stopped",
  "removing",
  "error",
]);
export type DatabaseStatus = z.infer<typeof databaseStatusSchema>;

/** Pinned, known-good major versions per engine — newest first. */
export const DATABASE_VERSIONS: Record<DatabaseType, readonly string[]> = {
  postgres: ["17", "16", "15", "14"],
  redis: ["7", "6"],
};

export const DATABASE_DEFAULT_PORTS: Record<DatabaseType, number> = {
  postgres: 5432,
  redis: 6379,
};

export const REDIS_POLICIES = ["allkeys-lru", "allkeys-lfu", "volatile-lru", "noeviction"] as const;
export const REDIS_PERSISTENCE = ["none", "rdb", "aof"] as const;
export type RedisPolicy = (typeof REDIS_POLICIES)[number];
export type RedisPersistence = (typeof REDIS_PERSISTENCE)[number];

const identifier = z.string().regex(/^[a-z_][a-z0-9_]{0,62}$/, "lowercase letters, digits and underscores");

/** Payload for POST /servers/:id/databases. */
export const createDatabaseInputSchema = z
  .object({
    type: databaseTypeSchema,
    name: z
      .string()
      .regex(/^[a-z][a-z0-9-]{1,38}[a-z0-9]$/, "3–40 chars: lowercase letters, digits and hyphens"),
    version: z.string(),
    /** Omit to let Deplyr pick: the engine's default port if free, else a random one. */
    port: z.number().int().min(1024).max(65535).optional(),
    memoryLimitMb: z.number().int().min(64).max(262_144).optional(),
    postgres: z.object({ dbName: identifier, username: identifier }).optional(),
    redis: z
      .object({ policy: z.enum(REDIS_POLICIES), persistence: z.enum(REDIS_PERSISTENCE) })
      .optional(),
  })
  .superRefine((input, ctx) => {
    if (!DATABASE_VERSIONS[input.type].includes(input.version)) {
      ctx.addIssue({ code: "custom", path: ["version"], message: `unsupported ${input.type} version` });
    }
  });
export type CreateDatabaseInput = z.infer<typeof createDatabaseInputSchema>;

/** What the database endpoints return. Never carries the password. */
export interface DatabaseSummary {
  id: string;
  serverId: string;
  projectId: string | null;
  name: string;
  type: DatabaseType;
  version: string;
  port: number | null;
  memoryLimitMb: number | null;
  containerName: string;
  status: DatabaseStatus;
  statusDetail: string | null;
  connectionSecretKey: string;
  /** Postgres: { dbName, username }. Redis: { policy, persistence }. */
  config: Record<string, string | number>;
  /** Latest agent sample — null until the first one arrives. */
  isUp: boolean | null;
  latencyMs: number | null;
  stats: Record<string, number | null> | null;
  lastCheckedAt: string | null;
  createdAt: string;
}

/** GET /databases/:id/credentials — the only place the password leaves the server. */
export interface DatabaseCredentials {
  host: string;
  port: number;
  username: string | null;
  dbName: string | null;
  password: string;
  connectionString: string;
}

export const databaseActionSchema = z.enum(["start", "stop", "restart"]);
export type DatabaseAction = z.infer<typeof databaseActionSchema>;

/** Which numbers the agent reports per engine — also the history whitelist. */
export const DATABASE_STAT_KEYS = {
  redis: ["hitRate", "memUsedMb", "opsPerSec", "clients", "keys", "evictedKeys"],
  postgres: ["connections", "cacheHitRatio", "tps", "sizeMb"],
} as const satisfies Record<DatabaseType, readonly string[]>;

export interface DatabaseMetricsPoint {
  t: string; // bucket start, ISO
  /** Share of samples in the bucket where the database answered (0–1). */
  up: number;
  latency: number | null;
  values: Record<string, number | null>;
  max: Record<string, number | null>;
}

export interface DatabaseMetricsHistory {
  range: z.infer<typeof metricsRangeSchema>;
  bucketSeconds: number;
  points: DatabaseMetricsPoint[];
}

/** Single source of truth for how a database is addressed — the worker uses
 * it to fill the linked project's secret, the API for the reveal endpoint. */
export function buildConnectionString(
  type: DatabaseType,
  c: { host: string; port: number; username?: string | null; dbName?: string | null; password: string },
): string {
  const pw = encodeURIComponent(c.password);
  if (type === "redis") return `redis://:${pw}@${c.host}:${c.port}`;
  return `postgres://${encodeURIComponent(c.username ?? "postgres")}:${pw}@${c.host}:${c.port}/${c.dbName ?? "postgres"}`;
}
