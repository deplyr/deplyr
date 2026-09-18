import type { Job } from "bullmq";
import type { HealthCheckJob } from "@argo/queue";

/** Implemented in PR7: hit the app's health endpoint, fire Slack on failure. */
export async function processHealthCheck(job: Job<HealthCheckJob>) {
  console.log(`[worker] health:check stub — projectId=${job.data.projectId}`);
}
