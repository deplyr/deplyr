import { runAgentCommandCollect } from "@deplyr/queue";
import { DB_QUERY_TIMEOUT_MS, type DbExecOutput, type DbExecPayload, type DbQueryResult } from "@deplyr/shared-types";

/** Splits a Redis command the way a shell would for quotes: `SET k "a b"`. */
export function splitCommand(input: string): string[] {
  const args: string[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;
  let started = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (quote) {
      if (ch === "\\" && quote === '"' && i + 1 < input.length) cur += input[++i];
      else if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
    } else if (/\s/.test(ch)) {
      if (started || cur) args.push(cur);
      cur = "";
      started = false;
    } else {
      cur += ch;
      started = true;
    }
  }
  if (quote) throw new Error("unterminated quote");
  if (started || cur) args.push(cur);
  return args;
}

// Commands that never return (streams) or would take the database away from
// under the dashboard. Everything else is the owner's to run.
const REDIS_BLOCKED = new Set(["monitor", "subscribe", "psubscribe", "ssubscribe", "sync", "psync", "shutdown", "debug", "replicaof", "slaveof", "config", "auth"]);

export function checkRedisCommand(args: string[]): string | null {
  const name = args[0]?.toLowerCase();
  if (!name) return "Type a command, for example: GET mykey";
  if (REDIS_BLOCKED.has(name)) return `${name.toUpperCase()} isn't available in the console.`;
  return null;
}

/** RFC 4180-style CSV, which is what `psql --csv` prints. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const MAX_ROWS = 500;
// psql prints a bare command tag ("INSERT 0 1", "CREATE TABLE") for statements
// that return no rows.
const COMMAND_TAG = /^[A-Z]+(?: [A-Z]+)*(?: \d+)*$/;

function shape(type: "postgres" | "redis", out: DbExecOutput): DbQueryResult {
  const { elapsedMs } = out;
  if (out.exitCode !== 0) {
    const raw = out.stderr.trim() || out.stdout.trim();
    if (!raw && elapsedMs >= DB_QUERY_TIMEOUT_MS - 500) return { kind: "error", error: "The query took too long and was stopped.", elapsedMs };
    // psql prefixes errors with "ERROR:  "; keep the message, drop the noise.
    if (/statement timeout/i.test(raw)) return { kind: "error", error: "The query took too long and was stopped.", elapsedMs };
    return { kind: "error", error: raw.replace(/^psql: error: /, "") || `The command exited with code ${out.exitCode}.`, elapsedMs };
  }
  if (type === "redis") return { kind: "text", text: out.stdout.trimEnd() || "(empty)", truncated: out.truncated, elapsedMs };

  const text = out.stdout.trimEnd();
  if (!text) return { kind: "message", message: "Done. No rows returned.", elapsedMs };
  const lines = text.split("\n");
  if (lines.length === 1 && COMMAND_TAG.test(lines[0]!)) return { kind: "message", message: lines[0]!, elapsedMs };
  const [columns = [], ...rows] = parseCsv(text);
  return { kind: "table", columns, rows: rows.slice(0, MAX_ROWS), truncated: out.truncated || rows.length > MAX_ROWS, elapsedMs };
}

/** Runs the payload on the server's agent and turns its reply into something the UI can draw. */
export async function runDatabaseQuery(serverId: string, payload: DbExecPayload): Promise<DbQueryResult> {
  let raw: string[];
  try {
    raw = await runAgentCommandCollect({
      serverId,
      name: "db.exec",
      payload: payload as unknown as Record<string, unknown>,
      timeoutMs: DB_QUERY_TIMEOUT_MS + 5_000,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    if (/no handler registered/i.test(detail)) {
      return { kind: "error", error: "This server's agent is out of date and doesn't support the console yet. Update the agent, then try again.", elapsedMs: 0 };
    }
    if (/timed out/i.test(detail)) return { kind: "error", error: "The server took too long to answer.", elapsedMs: 0 };
    return { kind: "error", error: detail, elapsedMs: 0 };
  }
  try {
    return shape(payload.type as "postgres" | "redis", JSON.parse(raw[0] ?? "") as DbExecOutput);
  } catch {
    return { kind: "error", error: "Got an unreadable answer from the server.", elapsedMs: 0 };
  }
}
