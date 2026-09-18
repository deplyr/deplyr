import { Queue } from "bullmq";
import { getRedisConnection } from "./connection";

/**
 * Queue names + typed job payloads shared by apps/api (enqueues) and
 * apps/worker (processes). Phase 1 has exactly these four; each gets its
 * processor implemented in the PR that builds the corresponding feature
 * (see docs/PHASE1_DESIGN.md section 4) — this package only defines the
 * shape so both sides agree on it from day one.
 */

export const QUEUE_NAMES = {
  serverInstall: "server:install",
  deployRun: "deploy:run",
  dbProvision: "db:provision",
  healthCheck: "health:check",
} as const;

export interface ServerInstallJob {
  serverId: string;
}

export interface DeployRunJob {
  deployId: string;
}

export interface DbProvisionJob {
  projectId: string;
}

export interface HealthCheckJob {
  projectId: string;
}

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

export function healthCheckQueue() {
  return new Queue<HealthCheckJob>(QUEUE_NAMES.healthCheck, {
    connection: getRedisConnection(),
  });
}
