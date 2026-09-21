import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db, databases, databaseMetrics, notifications, notify, servers } from "@deplyr/db";
import {
  DATABASE_STAT_KEYS,
  type DatabaseMetricsHistory,
  type DatabaseType,
  type DbStatsEvent,
  type MetricsRange,
} from "@deplyr/shared-types";
import { RANGE_CONFIG } from "./server-metrics";

const RETENTION_DAYS = 7;
const PRUNE_ONE_IN = 100;

// One failed probe is often just a slow docker exec; two in a row (~a minute)
// is a database that really isn't answering.
const FAILURES_BEFORE_ALERT = 2;
const failureStreak = new Map<string, number>();

async function alertOnTransition(
  row: typeof databases.$inferSelect,
  up: boolean,
) {
  // Stopping/restarting on purpose isn't an outage.
  if (row.status !== "running") {
    failureStreak.delete(row.id);
    return;
  }

  const [server] = await db.select().from(servers).where(eq(servers.id, row.serverId));
  if (!server) return;
  const engine = row.type === "redis" ? "Redis" : "PostgreSQL";
  const common = {
    ownerId: server.userId,
    fields: [
      { name: "Database", value: `${row.name} (${engine} ${row.version})` },
      { name: "Server", value: server.name },
    ],
    link: `/servers/${server.id}/databases/${row.id}`,
    serverId: server.id,
    serverName: server.name,
  };

  if (!up) {
    const streak = (failureStreak.get(row.id) ?? 0) + 1;
    failureStreak.set(row.id, streak);
    if (streak === FAILURES_BEFORE_ALERT) {
      await notify({
        ...common,
        event: "database.down",
        title: `${row.name} stopped responding`,
        message: `${engine} on ${server.name} isn't answering health checks.`,
        dedupeKey: `db:${row.id}:down`,
        cooldownMs: 10 * 60_000,
      });
    }
    return;
  }

  failureStreak.delete(row.id);
  // Only announce recovery if we announced the outage.
  const [outage] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.dedupeKey, `db:${row.id}:down`),
        eq(notifications.status, "sent"),
        gte(notifications.createdAt, new Date(Date.now() - 24 * 3_600_000)),
      ),
    )
    .limit(1);
  if (!outage || row.isUp !== false) return;
  await notify({
    ...common,
    event: "database.recovered",
    title: `${row.name} is responding again`,
    message: `${engine} on ${server.name} is healthy.`,
    dedupeKey: `db:${row.id}:up`,
    cooldownMs: 60_000,
  });
}

/** Persist one agent sweep. Samples for databases that don't belong to this
 * server are dropped — the socket is authenticated as a server, but the ids
 * in the payload are still untrusted input. */
export async function recordDbStats(serverId: string, samples: DbStatsEvent["samples"]) {
  if (samples.length === 0) return;

  const owned = await db
    .select()
    .from(databases)
    .where(and(eq(databases.serverId, serverId), inArray(databases.id, samples.map((s) => s.databaseId))));
  const before = new Map(owned.map((r) => [r.id, r]));
  const valid = samples.filter((s) => before.has(s.databaseId));
  if (valid.length === 0) return;

  const now = new Date();
  await db.insert(databaseMetrics).values(
    valid.map((s) => ({
      databaseId: s.databaseId,
      recordedAt: now,
      isUp: s.up,
      latencyMs: s.latencyMs === null ? null : Math.round(s.latencyMs),
      stats: s.stats,
    })),
  );

  for (const s of valid) {
    await db
      .update(databases)
      .set({
        isUp: s.up,
        latencyMs: s.latencyMs === null ? null : Math.round(s.latencyMs),
        // A down database has no numbers; keep the last known ones on screen.
        ...(s.up && { stats: s.stats }),
        lastCheckedAt: now,
      })
      .where(eq(databases.id, s.databaseId));
  }

  for (const s of valid) {
    const row = before.get(s.databaseId);
    if (row) await alertOnTransition(row, s.up).catch((err) => console.error("[db-alert]", err));
  }

  if (Math.floor(Math.random() * PRUNE_ONE_IN) === 0) {
    await db
      .delete(databaseMetrics)
      .where(lt(databaseMetrics.recordedAt, new Date(Date.now() - RETENTION_DAYS * 86_400_000)));
  }
}

export async function getDatabaseMetricsHistory(
  databaseId: string,
  type: DatabaseType,
  range: MetricsRange,
): Promise<DatabaseMetricsHistory> {
  const { windowSeconds, bucketSeconds } = RANGE_CONFIG[range];
  const since = new Date(Date.now() - windowSeconds * 1000);

  const width = sql.raw(String(Math.trunc(bucketSeconds)));
  const bucket = sql<Date>`date_bin(make_interval(secs => ${width}), ${databaseMetrics.recordedAt}, TIMESTAMPTZ '2000-01-01')`;

  // Keys are interpolated into SQL, so they come only from this const list —
  // never from the request.
  const keys = DATABASE_STAT_KEYS[type];
  const statColumns = Object.fromEntries(
    keys.flatMap((k) => {
      const col = sql`(${databaseMetrics.stats}->>${sql.raw(`'${k}'`)})::float`;
      return [
        [`avg_${k}`, sql<number | null>`avg(${col})`],
        [`max_${k}`, sql<number | null>`max(${col})`],
      ];
    }),
  );

  const rows = await db
    .select({
      t: bucket,
      up: sql<number>`avg(case when ${databaseMetrics.isUp} then 1.0 else 0.0 end)::float`,
      latency: sql<number | null>`avg(${databaseMetrics.latencyMs})::float`,
      ...statColumns,
    })
    .from(databaseMetrics)
    .where(and(eq(databaseMetrics.databaseId, databaseId), gte(databaseMetrics.recordedAt, since)))
    .groupBy(bucket)
    .orderBy(bucket);

  const round = (v: unknown) => (typeof v === "number" ? Math.round(v * 10) / 10 : null);

  return {
    range,
    bucketSeconds,
    points: rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        t: new Date(r.t).toISOString(),
        up: Math.round(r.up * 1000) / 1000,
        latency: round(r.latency),
        values: Object.fromEntries(keys.map((k) => [k, round(row[`avg_${k}`])])),
        max: Object.fromEntries(keys.map((k) => [k, round(row[`max_${k}`])])),
      };
    }),
  };
}
