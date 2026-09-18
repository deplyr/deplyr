import type { DeployInstallCommandPayload } from "@argo/shared-types";
import { runProcess } from "../lib/run-process";

/** Runs `npm install` in an ephemeral node:20-slim container against the
 * bind-mounted source — see docs/PHASE1_DESIGN.md section 5.1 for why
 * Docker containers, not pm2, run everything app-related. */
export async function install(
  payload: Record<string, unknown>,
  emitLog: (line: string) => void,
): Promise<void> {
  const { srcDir } = payload as unknown as DeployInstallCommandPayload;

  await runProcess(
    ["docker", "run", "--rm", "-v", `${srcDir}:/app`, "-w", "/app", "node:20-slim", "npm", "install"],
    emitLog,
  );
}
