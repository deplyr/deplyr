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
  domainVerify: "domain-verify",
  domainRemove: "domain-remove",
  domainRenew: "domain-renew",
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

/** Checks DNS, then (once it matches) configures nginx and requests a
 * certificate — one job re-enqueues itself for the next stage rather than
 * chaining queues, so a domain's whole history stays in one place to poll. */
export interface DomainVerifyJob {
  domainId: string;
}

export interface DomainRemoveJob {
  domainId: string;
}

/** No payload: one sweep renews every domain on every server, per-server,
 * via a single `domain.renewAll` agent call each (see PR-domains). */
export type DomainRenewJob = Record<string, never>;

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

export function domainVerifyQueue() {
  return new Queue<DomainVerifyJob>(QUEUE_NAMES.domainVerify, {
    connection: getRedisConnection(),
  });
}

export function domainRemoveQueue() {
  return new Queue<DomainRemoveJob>(QUEUE_NAMES.domainRemove, {
    connection: getRedisConnection(),
  });
}

export function domainRenewQueue() {
  return new Queue<DomainRenewJob>(QUEUE_NAMES.domainRenew, {
    connection: getRedisConnection(),
  });
}

const HEALTH_CHECK_INTERVAL_MS = 60_000;
// Certificates are valid ~90 days; renewal is attempted well before that, so
// a day's cadence gives huge margin without needing to be exact.
const DOMAIN_RENEW_INTERVAL_MS = 24 * 60 * 60 * 1000;
// A domain waiting on the user to create a DNS record is re-checked on this
// cadence until it resolves — no user action re-triggers it otherwise.
export const DOMAIN_VERIFY_RETRY_MS = 2 * 60 * 1000;

/** Idempotent — BullMQ no-ops re-adding a repeatable job with the same
 * name/repeat config, so it's safe to call on every worker boot. */
export async function scheduleHealthCheckSweep(): Promise<void> {
  await healthCheckQueue().add(
    "sweep",
    {},
    { repeat: { every: HEALTH_CHECK_INTERVAL_MS }, jobId: "health-check-sweep" },
  );
}

export async function scheduleDomainRenewalSweep(): Promise<void> {
  await domainRenewQueue().add(
    "sweep",
    {},
    { repeat: { every: DOMAIN_RENEW_INTERVAL_MS }, jobId: "domain-renew-sweep" },
  );
}
