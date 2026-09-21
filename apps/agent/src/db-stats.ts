import type { DbStatsEvent } from "@deplyr/shared-types";
import { captureProcess } from "./lib/capture-process";

type Sample = DbStatsEvent["samples"][number];

/**
 * Health + stats for every database container on this box, found by the
 * `deplyr.database` label the provision command sets. Credentials are read
 * from the container's own environment *inside* the container, so they never
 * pass through this process or its logs.
 *
 * Rates (hit ratio, tps, evictions) need two readings: the previous counters
 * are kept in memory per database. The first sample after an agent restart
 * therefore reports null for those — better than a lifetime average that
 * hides what's happening now.
 */

interface Counters {
  at: number;
  hits?: number;
  misses?: number;
  evicted?: number;
  blksHit?: number;
  blksRead?: number;
  xacts?: number;
}
const previous = new Map<string, Counters>();

interface Target {
  databaseId: string;
  type: string;
  container: string;
  running: boolean;
}

async function findTargets(): Promise<Target[]> {
  const ps = await captureProcess([
    "docker",
    "ps",
    "-a",
    "--filter",
    "label=deplyr.database",
    "--format",
    '{{.Label "deplyr.database"}}|{{.Label "deplyr.type"}}|{{.Names}}|{{.State}}',
  ]);
  if (ps.exitCode !== 0) return [];
  return ps.stdout
    .split("\n")
    .map((line) => line.trim().split("|"))
    .filter((parts): parts is [string, string, string, string] => parts.length === 4)
    .map(([databaseId, type, container, state]) => ({ databaseId, type, container, running: state === "running" }));
}

export async function sampleDatabases(): Promise<Sample[]> {
  const targets = await findTargets();
  const samples: Sample[] = [];
  for (const target of targets) {
    samples.push(await sampleOne(target));
  }
  return samples;
}

async function sampleOne(t: Target): Promise<Sample> {
  const down: Sample = { databaseId: t.databaseId, up: false, latencyMs: null, stats: {} };
  if (!t.running) return down;

  try {
    if (t.type === "redis") return await sampleRedis(t);
    if (t.type === "postgres") return await samplePostgres(t);
  } catch {
    /* fall through: an unreachable database is reported as down */
  }
  return down;
}

const ratio = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);
const num = (v: string | undefined) => (v === undefined || v === "" ? undefined : Number(v));

async function sampleRedis(t: Target): Promise<Sample> {
  const res = await captureProcess([
    "docker",
    "exec",
    t.container,
    "sh",
    "-c",
    'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli --no-auth-warning INFO',
  ]);
  if (res.exitCode !== 0 || !res.stdout.includes("redis_version")) {
    return { databaseId: t.databaseId, up: false, latencyMs: null, stats: {} };
  }

  const info = Object.fromEntries(
    res.stdout
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && l.includes(":"))
      .map((l) => {
        const i = l.indexOf(":");
        return [l.slice(0, i), l.slice(i + 1)] as const;
      }),
  );

  const hits = num(info.keyspace_hits);
  const misses = num(info.keyspace_misses);
  const evicted = num(info.evicted_keys);
  const now = Date.now();
  const prev = previous.get(t.databaseId);
  previous.set(t.databaseId, { at: now, hits, misses, evicted });

  let hitRate: number | null = null;
  let evictedDelta: number | null = null;
  if (prev && hits !== undefined && misses !== undefined && prev.hits !== undefined && prev.misses !== undefined) {
    const dh = hits - prev.hits;
    const dm = misses - prev.misses;
    // A counter going backwards means Redis restarted; skip that window.
    if (dh >= 0 && dm >= 0) hitRate = ratio(dh, dh + dm);
  }
  if (prev && evicted !== undefined && prev.evicted !== undefined && evicted >= prev.evicted) {
    evictedDelta = evicted - prev.evicted;
  }

  const keys = Object.entries(info)
    .filter(([k]) => /^db\d+$/.test(k))
    .reduce((sum, [, v]) => sum + Number(/keys=(\d+)/.exec(v)?.[1] ?? 0), 0);

  return {
    databaseId: t.databaseId,
    up: true,
    latencyMs: res.elapsedMs,
    stats: {
      hitRate,
      memUsedMb: Math.round(((num(info.used_memory) ?? 0) / 1024 / 1024) * 10) / 10,
      opsPerSec: num(info.instantaneous_ops_per_sec) ?? null,
      // our own probe is one of the connected clients
      clients: Math.max(0, (num(info.connected_clients) ?? 1) - 1),
      keys,
      evictedKeys: evictedDelta,
    },
  };
}

// One round trip for everything; local-socket auth inside the official
// image is trust, so no password is needed for the probe.
const PG_QUERY = `SELECT
  (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()),
  (SELECT setting::int FROM pg_settings WHERE name = 'max_connections'),
  pg_database_size(current_database()),
  (SELECT blks_hit FROM pg_stat_database WHERE datname = current_database()),
  (SELECT blks_read FROM pg_stat_database WHERE datname = current_database()),
  (SELECT xact_commit + xact_rollback FROM pg_stat_database WHERE datname = current_database())`;

async function samplePostgres(t: Target): Promise<Sample> {
  const res = await captureProcess([
    "docker",
    "exec",
    t.container,
    "sh",
    "-c",
    `psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -F '|' -c "${PG_QUERY.replace(/\n\s*/g, " ")}"`,
  ]);
  const row = res.stdout.trim().split("\n")[0]?.split("|");
  if (res.exitCode !== 0 || !row || row.length < 6) {
    return { databaseId: t.databaseId, up: false, latencyMs: null, stats: {} };
  }

  const [conns, maxConns, size, blksHit, blksRead, xacts] = row.map(Number) as [number, number, number, number, number, number];
  const now = Date.now();
  const prev = previous.get(t.databaseId);
  previous.set(t.databaseId, { at: now, blksHit, blksRead, xacts });

  let cacheHitRatio: number | null = null;
  let tps: number | null = null;
  if (prev && prev.blksHit !== undefined && prev.blksRead !== undefined && prev.xacts !== undefined) {
    const dHit = blksHit - prev.blksHit;
    const dRead = blksRead - prev.blksRead;
    const seconds = (now - prev.at) / 1000;
    if (dHit >= 0 && dRead >= 0) cacheHitRatio = ratio(dHit, dHit + dRead);
    if (xacts >= prev.xacts && seconds > 0) tps = Math.round(((xacts - prev.xacts) / seconds) * 10) / 10;
  }

  return {
    databaseId: t.databaseId,
    up: true,
    latencyMs: res.elapsedMs,
    stats: {
      connections: Math.max(0, conns - 1), // exclude this probe
      maxConnections: maxConns,
      cacheHitRatio,
      tps,
      sizeMb: Math.round((size / 1024 / 1024) * 10) / 10,
    },
  };
}
