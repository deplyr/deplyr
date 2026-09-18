import type { Job } from "bullmq";
import type { ServerInstallJob } from "@argo/queue";

/** Implemented in PR2: SSH in, install Docker + agent, wait for connect. */
export async function processServerInstall(job: Job<ServerInstallJob>) {
  console.log(`[worker] server:install stub — serverId=${job.data.serverId}`);
}
