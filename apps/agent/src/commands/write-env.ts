import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { DeployWriteEnvCommandPayload } from "@deplyr/shared-types";

export async function writeEnv(
  payload: Record<string, unknown>,
  emitLog: (line: string) => void,
): Promise<void> {
  const { envFile, env } = payload as unknown as DeployWriteEnvCommandPayload;

  // docker's --env-file format is literal KEY=value, one per line — no
  // quoting or escaping (a quoted value would keep the quotes). Multi-line
  // values can't be expressed in it; reject them clearly rather than
  // silently truncating a secret.
  for (const [key, value] of Object.entries(env)) {
    if (/[\r\n]/.test(value)) {
      throw new Error(`The value of ${key} contains a line break, which environment variables for containers can't hold here.`);
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error(`"${key}" isn't a valid environment variable name.`);
    }
  }

  const contents = Object.entries(env).map(([key, value]) => `${key}=${value}`).join("\n") + "\n";
  await mkdir(dirname(envFile), { recursive: true });
  await writeFile(envFile, contents, { encoding: "utf8", mode: 0o600 });
  await chmod(envFile, 0o600);

  // Never log the values themselves — just that they were written.
  emitLog(`wrote ${Object.keys(env).length} variable(s) for the app`);
}
