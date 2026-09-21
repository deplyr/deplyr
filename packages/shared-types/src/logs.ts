/**
 * Container logs, fetched on demand: the API asks the agent to run
 * `docker logs`, the agent streams the lines back over the command's `log`
 * events, the API parses them into a response. Nothing is stored — logs can be
 * large and may contain query data or personal information, so Deplyr never
 * keeps a copy.
 */

export const LOG_TAIL_DEFAULT = 200;
export const LOG_TAIL_MAX = 1000;

export type ContainerState = "running" | "stopped" | "missing";

export interface LogLine {
  /** Docker's RFC3339Nano timestamp, exactly as printed. */
  ts: string;
  text: string;
  stream: "stdout" | "stderr";
}

/** What GET /databases/:id/logs and GET /projects/:id/logs return. */
export interface ContainerLogs {
  lines: LogLine[];
  /** Pass back as `?since=` to get only newer lines; null when there are no lines yet. */
  nextSince: string | null;
  containerRunning: boolean;
  containerState: ContainerState;
  /** A plain-English note when there's nothing to show, e.g. the container was removed. */
  message: string | null;
}

/** Payload for the agent's "logs.container" command. */
export interface LogsCommandPayload {
  containerName: string;
  tail: number;
  since?: string;
}

const TS = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/;

/**
 * A Docker timestamp as nanoseconds since the epoch, or null if it isn't one.
 * Docker trims trailing zeros from the fraction ("…05.1Z" vs "…05.12Z"), so
 * plain string comparison orders lines wrongly — always compare via this.
 */
export function dockerTsToNs(ts: string): bigint | null {
  const m = TS.exec(ts);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, frac, zone] = m;
  let ms = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  if (zone !== "Z") {
    const sign = zone![0] === "-" ? -1 : 1;
    ms -= sign * (Number(zone!.slice(1, 3)) * 60 + Number(zone!.slice(4, 6))) * 60_000;
  }
  const nanos = BigInt((frac ?? "").padEnd(9, "0"));
  return BigInt(ms) * 1_000_000n + nanos;
}

export function compareDockerTs(a: string, b: string): number {
  const na = dockerTsToNs(a);
  const nb = dockerTsToNs(b);
  if (na === null || nb === null) return a < b ? -1 : a > b ? 1 : 0;
  return na < nb ? -1 : na > nb ? 1 : 0;
}

// ---- wire format between agent and API: one string per `log` event --------
//   "S|running" | "S|stopped" | "S|missing"   first line: container state
//   "O|<ts> <text>" / "E|<ts> <text>"          stdout / stderr line

export type WireLine = { kind: "state"; state: ContainerState } | { kind: "line"; line: LogLine };

export const encodeStateLine = (state: ContainerState) => `S|${state}`;
export const encodeLogLine = (l: LogLine) => `${l.stream === "stderr" ? "E" : "O"}|${l.ts} ${l.text}`;

export function parseWireLine(raw: string): WireLine | null {
  if (raw.startsWith("S|")) {
    const state = raw.slice(2);
    return state === "running" || state === "stopped" || state === "missing" ? { kind: "state", state } : null;
  }
  const stream = raw[0] === "E" ? "stderr" : raw[0] === "O" ? "stdout" : null;
  if (!stream || raw[1] !== "|") return null;
  const rest = raw.slice(2);
  const space = rest.indexOf(" ");
  const ts = space === -1 ? rest : rest.slice(0, space);
  if (dockerTsToNs(ts) === null) return null;
  return { kind: "line", line: { ts, text: space === -1 ? "" : rest.slice(space + 1), stream } };
}
