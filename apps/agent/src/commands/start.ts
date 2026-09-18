import type { DeployStartCommandPayload } from "@argo/shared-types";
import { runProcess } from "../lib/run-process";

export async function start(
  payload: Record<string, unknown>,
  emitLog: (line: string) => void,
): Promise<void> {
  const { srcDir, containerName, port } = payload as unknown as DeployStartCommandPayload;

  // Fine if it doesn't exist yet (first deploy) — this just makes
  // re-deploys idempotent.
  await runProcess(["docker", "rm", "-f", containerName], emitLog).catch(() => {});

  await runProcess(
    [
      "docker",
      "run",
      "-d",
      "--name",
      containerName,
      "--restart",
      "unless-stopped",
      "--network",
      "host",
      "-v",
      `${srcDir}:/app`,
      "-w",
      "/app",
      "--env-file",
      `${srcDir}/.env`,
      // Explicit -e after --env-file wins on conflict — guarantees the
      // port Argo allocated is what the app actually binds to.
      "-e",
      `PORT=${port}`,
      "node:20-slim",
      "npm",
      "run",
      "start",
    ],
    emitLog,
  );
}
