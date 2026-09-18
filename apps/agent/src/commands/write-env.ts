import { writeFile } from "node:fs/promises";
import type { DeployWriteEnvCommandPayload } from "@argo/shared-types";

export async function writeEnv(
  payload: Record<string, unknown>,
  emitLog: (line: string) => void,
): Promise<void> {
  const { srcDir, env } = payload as unknown as DeployWriteEnvCommandPayload;

  const contents =
    Object.entries(env)
      .map(([key, value]) => `${key}=${escapeEnvValue(value)}`)
      .join("\n") + "\n";
  await writeFile(`${srcDir}/.env`, contents, "utf8");

  // Never log the values themselves — just that they were written.
  emitLog(`wrote ${Object.keys(env).length} variable(s) to .env`);
}

function escapeEnvValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}
