import type { DeployBuildCommandPayload } from "@deplyr/shared-types";
import { runProcess } from "../lib/run-process";
import { PKG_CACHE_ARGS, assertWorkDir } from "../lib/workdir";

export async function build(
  payload: Record<string, unknown>,
  emitLog: (line: string) => void,
): Promise<void> {
  const p = payload as unknown as DeployBuildCommandPayload;
  await assertWorkDir(p.workDir);

  if (p.mode === "dockerfile") {
    // The image is built from the repo's own Dockerfile. Secrets are
    // deliberately not passed in: they reach the container at run time via
    // --env-file, never through the build context or a layer.
    await runProcess(["docker", "build", "-t", p.imageTag, "-f", `${p.workDir}/${p.dockerfile}`, p.workDir], emitLog);
    return;
  }

  if (!p.command) {
    emitLog("No build step for this project — skipping.");
    return;
  }

  // --env-file so build-time variables (Next.js NEXT_PUBLIC_*) are present.
  await runProcess(
    [
      "docker",
      "run",
      "--rm",
      ...PKG_CACHE_ARGS,
      "--env-file",
      p.envFile,
      "-v",
      `${p.workDir}:/app`,
      "-w",
      "/app",
      p.image,
      "sh",
      "-c",
      p.command,
    ],
    emitLog,
  );
}
