import { Worker } from "bullmq";
import { QUEUE_NAMES, getRedisConnection, scheduleHealthCheckSweep, scheduleDomainRenewalSweep } from "@deplyr/queue";
import { processServerInstall } from "./jobs/server-install";
import { processDeployRun } from "./jobs/deploy-run";
import { processDbProvision } from "./jobs/db-provision";
import { processDbOps } from "./jobs/db-ops";
import { processHealthCheck } from "./jobs/health-check";
import { processDomainVerify } from "./jobs/domain-verify";
import { processDomainRemove } from "./jobs/domain-remove";
import { processDomainRenew } from "./jobs/domain-renew";

const connection = getRedisConnection();

const workers = [
  new Worker(QUEUE_NAMES.serverInstall, processServerInstall, { connection }),
  new Worker(QUEUE_NAMES.deployRun, processDeployRun, { connection }),
  new Worker(QUEUE_NAMES.dbProvision, processDbProvision, { connection }),
  new Worker(QUEUE_NAMES.dbOps, processDbOps, { connection }),
  new Worker(QUEUE_NAMES.healthCheck, processHealthCheck, { connection }),
  new Worker(QUEUE_NAMES.domainVerify, processDomainVerify, { connection }),
  new Worker(QUEUE_NAMES.domainRemove, processDomainRemove, { connection }),
  new Worker(QUEUE_NAMES.domainRenew, processDomainRenew, { connection }),
];

await scheduleHealthCheckSweep();
await scheduleDomainRenewalSweep();

console.log(`[worker] running, watching ${workers.length} queues`);

for (const worker of workers) {
  worker.on("failed", (job, err) => {
    console.error(`[worker] job ${job?.id} in queue ${worker.name} failed:`, err);
  });
}

process.on("SIGTERM", async () => {
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
});
