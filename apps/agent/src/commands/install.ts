import type { DeployInstallCommandPayload } from "@deplyr/shared-types";
import { runProcess } from "../lib/run-process";
import { PKG_CACHE_ARGS, assertWorkDir } from "../lib/workdir";

/** Runs the project's install command in an ephemeral container of its
 * runtime image, against the bind-mounted source — see
 * docs/architecture.md for why containers, not pm2. */
export async function install(
  payload: Record<string, unknown>,
  emitLog: (line: string) => void,
): Promise<void> {
  const { workDir, image, command } = payload as unknown as DeployInstallCommandPayload;

  if (!command) {
    emitLog("No install step for this project — skipping.");
    return;
  }
  await assertWorkDir(workDir);

  await runProcess(
    ["docker", "run", "--rm", ...PKG_CACHE_ARGS, "-v", `${workDir}:/app`, "-w", "/app", image, "sh", "-c", command],
    emitLog,
  );
}
