import type { DeployStartCommandPayload } from "@deplyr/shared-types";
import { runProcess } from "../lib/run-process";

export async function start(
  payload: Record<string, unknown>,
  emitLog: (line: string) => void,
): Promise<void> {
  const p = payload as unknown as DeployStartCommandPayload;

  // Fine if it doesn't exist yet (first deploy) — this just makes
  // re-deploys idempotent.
  await runProcess(["docker", "rm", "-f", p.containerName], emitLog).catch(() => {});

  const common = [
    "docker",
    "run",
    "-d",
    "--name",
    p.containerName,
    "--restart",
    "unless-stopped",
    // Host networking: apps reach databases on 127.0.0.1:<port> (they're
    // bound to loopback, see db-provision.ts) and nginx proxies to us there.
    "--network",
    "host",
    "--env-file",
    p.envFile,
    // Explicit -e wins over --env-file — guarantees the port Deplyr allocated
    // is what the app actually binds to.
    "-e",
    `PORT=${p.port}`,
    ...Object.entries(p.extraEnv).flatMap(([k, v]) => ["-e", `${k}=${v}`]),
  ];

  if (p.mode === "dockerfile") {
    // No command: the image's own CMD/ENTRYPOINT decides what runs.
    await runProcess([...common, p.imageTag], emitLog);
    return;
  }

  await runProcess([...common, "-v", `${p.workDir}:/app`, "-w", "/app", p.image, "sh", "-c", p.command], emitLog);
}
