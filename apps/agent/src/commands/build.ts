import type { DeployBuildCommandPayload } from "@argo/shared-types";
import { runProcess } from "../lib/run-process";

export async function build(
  payload: Record<string, unknown>,
  emitLog: (line: string) => void,
): Promise<void> {
  const { srcDir } = payload as unknown as DeployBuildCommandPayload;

  await runProcess(
    ["docker", "run", "--rm", "-v", `${srcDir}:/app`, "-w", "/app", "node:20-slim", "npm", "run", "build"],
    emitLog,
  );
}
