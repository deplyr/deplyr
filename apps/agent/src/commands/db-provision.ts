import type { DbProvisionPayload } from "@deplyr/shared-types";
import { runProcess } from "../lib/run-process";

const SECRET_ENVS = ["POSTGRES_PASSWORD=", "REDIS_PASSWORD="];

/** Container name -> its data volume. Also used by db.remove. */
export const volumeFor = (containerName: string) => `${containerName}-data`;

// docker prints the real cause ("port is already allocated", "no such
// image") on stderr and then ends with a generic "Run 'docker run --help'"
// hint. Keep the most specific line, not simply the last one, so the reason
// surfaced in the UI is actionable.
const CAUSE = /error|denied|already|no such|failed|not found|cannot|unable/i;
const HINT = /^run 'docker/i;

function reasonCollector(emitLog: (line: string) => void) {
  let cause = "";
  let lastLine = "";
  return {
    emit(line: string) {
      emitLog(line);
      if (line.startsWith("$ ") || HINT.test(line)) return;
      lastLine = line;
      if (CAUSE.test(line)) cause = line;
    },
    get reason() {
      return (cause || lastLine).replace(/^docker: /i, "").replace(/^Error response from daemon: /i, "");
    },
  };
}

async function volumeExists(name: string): Promise<boolean> {
  try {
    await runProcess(["docker", "volume", "inspect", name], () => {});
    return true;
  } catch {
    return false;
  }
}

export async function dbProvision(
  payload: Record<string, unknown>,
  emitLog: (line: string) => void,
): Promise<void> {
  const p = payload as unknown as DbProvisionPayload;
  const log = reasonCollector(emitLog);

  await runProcess(["docker", "rm", "-f", p.containerName], () => {}).catch(() => {});
  // A retry re-attaches to an existing volume (and its data); only a volume
  // this attempt created is ours to clean up if it fails.
  const hadVolume = await volumeExists(volumeFor(p.containerName));

  const cmd = [
    "docker",
    "run",
    "-d",
    "--name",
    p.containerName,
    "--restart",
    "unless-stopped",
    "--label",
    `deplyr.database=${p.databaseId}`,
    "--label",
    `deplyr.type=${p.type}`,
    // Loopback-only publish: private by default. Apps on the box run with
    // --network host and reach it at 127.0.0.1:<port>; nothing off the box can.
    "-p",
    `127.0.0.1:${p.port}:${p.type === "postgres" ? 5432 : 6379}`,
    ...(p.memoryLimitMb ? ["--memory", `${p.memoryLimitMb}m`] : []),
    "-v",
    `${volumeFor(p.containerName)}:${p.type === "postgres" ? "/var/lib/postgresql/data" : "/data"}`,
  ];

  if (p.type === "postgres") {
    const pg = p.postgres;
    if (!pg) throw new Error("postgres options missing");
    cmd.push(
      "-e",
      `POSTGRES_DB=${pg.dbName}`,
      "-e",
      `POSTGRES_USER=${pg.username}`,
      "-e",
      `POSTGRES_PASSWORD=${p.password}`,
      `postgres:${p.version}-alpine`,
      // Server flags (the image's entrypoint hands leading "-c" args to
      // postgres). Out of the box Postgres logs almost nothing useful, so log
      // queries slower than 500ms and lock waits, and turn off per-connection
      // lines — with the 30s stats probe they'd bury everything else.
      "-c",
      "log_min_duration_statement=500",
      "-c",
      "log_lock_waits=on",
      "-c",
      "log_connections=off",
      "-c",
      "log_disconnections=off",
    );
  } else {
    const redis = p.redis ?? { policy: "allkeys-lru", persistence: "none" };
    // Leave headroom under the container limit for fork/copy-on-write and
    // client buffers, otherwise the kernel OOM-kills Redis before maxmemory
    // ever evicts anything.
    const maxmemory = p.memoryLimitMb ? Math.floor(p.memoryLimitMb * 0.75) : null;
    const persistence =
      redis.persistence === "aof"
        ? ["--appendonly", "yes", "--appendfsync", "everysec", "--save", ""]
        : redis.persistence === "rdb"
          ? ["--appendonly", "no", "--save", "3600 1 300 100 60 10000"]
          : ["--appendonly", "no", "--save", ""];

    cmd.push(
      "-e",
      `REDIS_PASSWORD=${p.password}`,
      `redis:${p.version}-alpine`,
      // The password is read from the container env inside the shell, so it
      // never shows up in this container's argv / `ps` output.
      "sh",
      "-c",
      'exec redis-server --requirepass "$REDIS_PASSWORD" "$@"',
      "redis-server",
      ...(maxmemory ? ["--maxmemory", `${maxmemory}mb`] : []),
      "--maxmemory-policy",
      redis.policy,
      ...persistence,
    );
  }

  const displayCmd = cmd.map((arg) => (SECRET_ENVS.some((s) => arg.startsWith(s)) ? `${arg.split("=")[0]}=***` : arg));

  try {
    await runProcess(cmd, log.emit, { displayCmd });
  } catch (err) {
    // `docker run` can fail after creating the container (e.g. the port bind),
    // leaving a dead "Created" one that would block the name on retry.
    await runProcess(["docker", "rm", "-f", p.containerName], () => {}).catch(() => {});
    if (!hadVolume) {
      await runProcess(["docker", "volume", "rm", "-f", volumeFor(p.containerName)], () => {}).catch(() => {});
    }
    throw new Error(log.reason || (err instanceof Error ? err.message : String(err)));
  }
}
