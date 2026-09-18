import { Worker } from "bullmq";
import { QUEUE_NAMES, getRedisConnection, scheduleHealthCheckSweep } from "@argo/queue";
import { processServerInstall } from "./jobs/server-install";
import { processDeployRun } from "./jobs/deploy-run";
import { processDbProvision } from "./jobs/db-provision";
import { processHealthCheck } from "./jobs/health-check";

const connection = getRedisConnection();

const workers = [
  new Worker(QUEUE_NAMES.serverInstall, processServerInstall, { connection }),
  new Worker(QUEUE_NAMES.deployRun, processDeployRun, { connection }),
  new Worker(QUEUE_NAMES.dbProvision, processDbProvision, { connection }),
  new Worker(QUEUE_NAMES.healthCheck, processHealthCheck, { connection }),
];

await scheduleHealthCheckSweep();

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
