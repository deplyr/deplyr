import type { Job } from "bullmq";
import type { DbProvisionJob } from "@argo/queue";

/** Implemented in PR6: provision a Postgres container via the agent. */
export async function processDbProvision(job: Job<DbProvisionJob>) {
  console.log(`[worker] db:provision stub — projectId=${job.data.projectId}`);
}
