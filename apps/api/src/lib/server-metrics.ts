import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db, serverMetrics } from "@deplyr/db";
import type { HeartbeatEvent, MetricsRange } from "@deplyr/shared-types";

// Rolling window kept in the table — matches the longest range the UI offers.
const RETENTION_DAYS = 7;
// ~1 in N heartbeats also prunes, so cleanup rides along with writes and
// needs no separate scheduled job. Heartbeats are 15s apart: ~1 prune / 50 min.
const PRUNE_ONE_IN = 200;

export const RANGE_CONFIG: Record<MetricsRange, { windowSeconds: number; bucketSeconds: number }> = {
  "1h": { windowSeconds: 3_600, bucketSeconds: 60 }, //         60 points
  "6h": { windowSeconds: 21_600, bucketSeconds: 360 }, //       60 points
  "24h": { windowSeconds: 86_400, bucketSeconds: 1_440 }, //    60 points
  "7d": { windowSeconds: 604_800, bucketSeconds: 10_080 }, //   60 points
};

export async function recordHeartbeat(serverId: string, event: HeartbeatEvent) {
  await db.insert(serverMetrics).values({
    serverId,
    cpuPercent: Math.round(event.cpuPercent),
    memPercent: Math.round(event.memPercent),
    diskPercent: Math.round(event.diskPercent),
    loadAvg1: event.loadAvg1 ?? null,
  });

  if (Math.floor(Math.random() * PRUNE_ONE_IN) === 0) {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
    await db
      .delete(serverMetrics)
      .where(and(eq(serverMetrics.serverId, serverId), lt(serverMetrics.recordedAt, cutoff)));
  }
}

/** Averages per fixed-width time bucket, oldest first; empty buckets are simply absent. */
export async function getMetricsHistory(serverId: string, range: MetricsRange) {
  const { windowSeconds, bucketSeconds } = RANGE_CONFIG[range];
  const since = new Date(Date.now() - windowSeconds * 1000);

  // date_bin snaps each row to the start of its bucket on a fixed origin, so
  // bucket edges stay put between requests (charts don't shimmer on refresh).
  // bucketSeconds is inlined (not a bind param) so the SELECT and GROUP BY
  // copies of this expression are textually identical — Postgres can't match
  // two separate $n placeholders. Safe: it only ever comes from RANGE_CONFIG.
  const width = sql.raw(String(Math.trunc(bucketSeconds)));
  const bucket = sql<Date>`date_bin(make_interval(secs => ${width}), ${serverMetrics.recordedAt}, TIMESTAMPTZ '2000-01-01')`;
  const rows = await db
    .select({
      t: bucket,
      cpu: sql<number>`avg(${serverMetrics.cpuPercent})::float`,
      mem: sql<number>`avg(${serverMetrics.memPercent})::float`,
      disk: sql<number>`avg(${serverMetrics.diskPercent})::float`,
      load: sql<number | null>`avg(${serverMetrics.loadAvg1})::float`,
      cpuMax: sql<number>`max(${serverMetrics.cpuPercent})::float`,
      memMax: sql<number>`max(${serverMetrics.memPercent})::float`,
      diskMax: sql<number>`max(${serverMetrics.diskPercent})::float`,
      loadMax: sql<number | null>`max(${serverMetrics.loadAvg1})::float`,
    })
    .from(serverMetrics)
    .where(and(eq(serverMetrics.serverId, serverId), gte(serverMetrics.recordedAt, since)))
    .groupBy(bucket)
    .orderBy(bucket);

  return {
    range,
    bucketSeconds,
    points: rows.map((r) => ({
      t: new Date(r.t).toISOString(),
      cpu: Math.round(r.cpu * 10) / 10,
      mem: Math.round(r.mem * 10) / 10,
      disk: Math.round(r.disk * 10) / 10,
      load: r.load === null ? null : Math.round(r.load * 100) / 100,
      cpuMax: r.cpuMax,
      memMax: r.memMax,
      diskMax: r.diskMax,
      loadMax: r.loadMax === null ? null : Math.round(r.loadMax * 100) / 100,
    })),
  };
}
