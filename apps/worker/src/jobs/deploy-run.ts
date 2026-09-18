import type { Job } from "bullmq";
import type { DeployRunJob } from "@argo/queue";

/** Implemented in PR5: orchestrate the clone→...→health_check pipeline. */
export async function processDeployRun(job: Job<DeployRunJob>) {
  console.log(`[worker] deploy:run stub — deployId=${job.data.deployId}`);
}
