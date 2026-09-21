import { Queue } from "bullmq";
import { getRedisConnection } from "./connection";

/**
 * Queue names + typed job payloads shared by apps/api (enqueues) and
 * apps/worker (processes). Phase 1 has exactly these four; each gets its
 * processor implemented in the PR that builds the corresponding feature
 * (see docs/PHASE1_DESIGN.md section 4) — this package only defines the
 * shape so both sides agree on it from day one.
 */

// BullMQ rejects ":" in queue names, so hyphens rather than the
// "agent:commands"-style namespacing used for the Redis pub/sub channels
// in agent-bridge.ts (those aren't BullMQ queues, so ":" is fine there).
export const QUEUE_NAMES = {
  serverInstall: "server-install",
  deployRun: "deploy-run",
  dbProvision: "db-provision",
  dbOps: "db-ops",
  healthCheck: "health-check",
} as const;

export interface ServerInstallJob {
  serverId: string;
}

export interface DeployRunJob {
  deployId: string;
}

export interface DbProvisionJob {
  databaseId: string;
}

/** Everything that acts on an already-provisioned database container. */
export interface DbOpsJob {
  databaseId: string;
  action: "start" | "stop" | "restart" | "remove";
}

// PR1 originally shaped this as a per-project job; PR7 (which actually
// implements it) does a single repeatable sweep over every live project
// per run instead — simpler to schedule than N per-project repeatables,
// and there's nothing project-specific to pass in.
export type HealthCheckJob = Record<string, never>;

export function serverInstallQueue() {
  return new Queue<ServerInstallJob>(QUEUE_NAMES.serverInstall, {
    connection: getRedisConnection(),
  });
}

export function deployRunQueue() {
  return new Queue<DeployRunJob>(QUEUE_NAMES.deployRun, {
    connection: getRedisConnection(),
  });
}

export function dbProvisionQueue() {
  return new Queue<DbProvisionJob>(QUEUE_NAMES.dbProvision, {
    connection: getRedisConnection(),
  });
}

export function dbOpsQueue() {
  return new Queue<DbOpsJob>(QUEUE_NAMES.dbOps, {
    connection: getRedisConnection(),
  });
}

export function healthCheckQueue() {
  return new Queue<HealthCheckJob>(QUEUE_NAMES.healthCheck, {
    connection: getRedisConnection(),
  });
}

const HEALTH_CHECK_INTERVAL_MS = 60_000;

/** Idempotent — BullMQ no-ops re-adding a repeatable job with the same
 * name/repeat config, so it's safe to call on every worker boot. */
export async function scheduleHealthCheckSweep(): Promise<void> {
  await healthCheckQueue().add(
    "sweep",
    {},
    { repeat: { every: HEALTH_CHECK_INTERVAL_MS }, jobId: "health-check-sweep" },
  );
}
