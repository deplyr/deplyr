import type { DbProvisionCommandPayload } from "@argo/shared-types";
import { runProcess } from "../lib/run-process";

export async function provisionPostgres(
  payload: Record<string, unknown>,
  emitLog: (line: string) => void,
): Promise<void> {
  const { containerName, port, dbName, username, password } =
    payload as unknown as DbProvisionCommandPayload;

  await runProcess(["docker", "rm", "-f", containerName], emitLog).catch(() => {});

  const cmd = [
    "docker",
    "run",
    "-d",
    "--name",
    containerName,
    "--restart",
    "unless-stopped",
    // Bridge networking + a loopback-only published port — deliberately
    // not --network host (unlike app/nginx containers): a database is
    // exactly the thing worth keeping off the host network. See
    // docs/PHASE1_DESIGN.md section 5.1.
    "-p",
    `127.0.0.1:${port}:5432`,
    "-e",
    `POSTGRES_DB=${dbName}`,
    "-e",
    `POSTGRES_USER=${username}`,
    "-e",
    `POSTGRES_PASSWORD=${password}`,
    "-v",
    `${containerName}-data:/var/lib/postgresql/data`,
    "postgres:16-alpine",
  ];
  const displayCmd = cmd.map((arg) =>
    arg.startsWith("POSTGRES_PASSWORD=") ? "POSTGRES_PASSWORD=***" : arg,
  );

  await runProcess(cmd, emitLog, { displayCmd });
}
