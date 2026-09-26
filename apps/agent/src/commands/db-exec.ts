import { DB_QUERY_MAX_OUTPUT_BYTES, DB_QUERY_TIMEOUT_MS, type DbExecOutput, type DbExecPayload } from "@deplyr/shared-types";
import { captureProcess } from "../lib/capture-process";

// Same rule as logs: names Deplyr generated, never something docker could
// mistake for a flag.
const CONTAINER_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;
const IDENTIFIER = /^[a-zA-Z0-9_.-]{1,63}$/;

/**
 * Runs one query or command inside a database's own container with `docker exec`
 * and replies with a single JSON line (see DbExecOutput). Nothing listens on a
 * network port for this: the client already lives in the container, so it works
 * on any server without opening anything.
 *
 * Arguments are passed as an array, never through a shell, and the password
 * goes in through the environment so it doesn't show up in `ps`.
 */
export async function dbExec(payload: Record<string, unknown>, emitLog: (line: string) => void): Promise<void> {
  const p = payload as unknown as DbExecPayload;
  if (typeof p.containerName !== "string" || !CONTAINER_NAME.test(p.containerName)) throw new Error("invalid container name");
  if (typeof p.password !== "string" || p.password.length === 0) throw new Error("missing password");

  let cmd: string[];
  if (p.type === "postgres") {
    if (typeof p.statement !== "string" || p.statement.length === 0) throw new Error("missing statement");
    if (!p.username || !IDENTIFIER.test(p.username) || !p.dbName || !IDENTIFIER.test(p.dbName)) throw new Error("invalid user or database name");
    // Read-only and a statement timeout are set as session options — a guard
    // against slips, not a security boundary (the user owns this database).
    const options = [`-c statement_timeout=${DB_QUERY_TIMEOUT_MS - 2_000}`, ...(p.allowWrites ? [] : ["-c default_transaction_read_only=on"])].join(" ");
    cmd = [
      "docker", "exec", "-i", "-e", `PGPASSWORD=${p.password}`, "-e", `PGOPTIONS=${options}`, p.containerName,
      "psql", "-X", "--csv", "-v", "ON_ERROR_STOP=1", "-U", p.username, "-d", p.dbName, "-c", p.statement,
    ];
  } else if (p.type === "redis") {
    if (!Array.isArray(p.args) || p.args.length === 0 || p.args.some((a) => typeof a !== "string")) throw new Error("missing command");
    cmd = ["docker", "exec", "-e", `REDISCLI_AUTH=${p.password}`, p.containerName, "redis-cli", "--no-auth-warning", ...p.args];
  } else {
    throw new Error("unsupported database type");
  }

  const res = await captureProcess(cmd, DB_QUERY_TIMEOUT_MS);
  const cap = (s: string) => (Buffer.byteLength(s) > DB_QUERY_MAX_OUTPUT_BYTES ? s.slice(0, DB_QUERY_MAX_OUTPUT_BYTES) : s);
  const out: DbExecOutput = {
    stdout: cap(res.stdout),
    stderr: cap(res.stderr),
    // A killed process (timeout) reports a signal exit code; make that legible.
    exitCode: res.exitCode,
    elapsedMs: res.elapsedMs,
    truncated: Buffer.byteLength(res.stdout) > DB_QUERY_MAX_OUTPUT_BYTES,
  };
  emitLog(JSON.stringify(out));
}
