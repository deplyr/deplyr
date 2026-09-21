import {
  LOG_TAIL_DEFAULT,
  LOG_TAIL_MAX,
  compareDockerTs,
  dockerTsToNs,
  encodeLogLine,
  encodeStateLine,
  type LogLine,
  type LogsCommandPayload,
} from "@deplyr/shared-types";
import { captureProcess } from "../lib/capture-process";

const DOCKER_TIMEOUT_MS = 10_000;
// A wedged app printing megabytes per line must not turn one request into a
// memory or bandwidth problem: cap each line and the whole response, keeping
// the newest lines (the ones someone debugging a live problem wants).
const MAX_LINE_CHARS = 4_000;
const MAX_RESPONSE_BYTES = 256 * 1024;

// Names Deplyr generates: letters, digits, "_", "." and "-". Anything else
// could be mistaken for a docker flag, so refuse it instead of passing it on.
const CONTAINER_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;

interface Entry extends LogLine {
  order: number;
}

function parseStream(stdout: string, stream: LogLine["stream"], startOrder: number): Entry[] {
  const out: Entry[] = [];
  for (const raw of stdout.split("\n")) {
    if (!raw) continue;
    const space = raw.indexOf(" ");
    const ts = space === -1 ? raw : raw.slice(0, space);
    if (dockerTsToNs(ts) === null) continue; // e.g. a partial line from a truncated stream
    const text = (space === -1 ? "" : raw.slice(space + 1)).replace(/\r$/, "");
    out.push({ ts, text: text.length > MAX_LINE_CHARS ? `${text.slice(0, MAX_LINE_CHARS)}… [truncated]` : text, stream, order: startOrder + out.length });
  }
  return out;
}

/** Streams a container's recent output back as one `log` event per line. */
export async function logsContainer(
  payload: Record<string, unknown>,
  emitLog: (line: string) => void,
): Promise<void> {
  const p = payload as unknown as LogsCommandPayload;
  if (typeof p.containerName !== "string" || !CONTAINER_NAME.test(p.containerName)) {
    throw new Error("invalid container name");
  }
  const requested = Math.trunc(Number(p.tail));
  // Zero, negative or junk means "not specified" — same rule as the API's ?tail=.
  const tail = requested > 0 ? Math.min(requested, LOG_TAIL_MAX) : LOG_TAIL_DEFAULT;
  const sinceNs = p.since ? dockerTsToNs(p.since) : null;
  if (p.since && sinceNs === null) throw new Error("invalid since timestamp");

  const inspect = await captureProcess(["docker", "inspect", "-f", "{{.State.Running}}", p.containerName], DOCKER_TIMEOUT_MS);
  if (inspect.exitCode !== 0) {
    emitLog(encodeStateLine("missing"));
    return;
  }
  emitLog(encodeStateLine(inspect.stdout.trim() === "true" ? "running" : "stopped"));

  // docker replays the container's own stdout and stderr on the matching
  // streams of `docker logs`, so keeping them apart here is what lets the UI
  // mark stderr lines. Merged back into one timeline by timestamp.
  const res = await captureProcess(
    ["docker", "logs", "--timestamps", "--tail", String(tail), ...(p.since ? ["--since", p.since] : []), p.containerName],
    DOCKER_TIMEOUT_MS,
  );
  if (res.exitCode !== 0) {
    throw new Error(res.stderr.trim().split("\n").pop() || `docker logs exited with code ${res.exitCode}`);
  }

  const out = parseStream(res.stdout, "stdout", 0);
  const err = parseStream(res.stderr, "stderr", out.length);
  let entries = [...out, ...err].sort((a, b) => compareDockerTs(a.ts, b.ts) || a.order - b.order);

  // `--since` is inclusive; the caller already has everything up to and
  // including that instant.
  if (sinceNs !== null) entries = entries.filter((e) => (dockerTsToNs(e.ts) ?? 0n) > sinceNs);

  let bytes = 0;
  const kept: Entry[] = [];
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]!;
    bytes += e.text.length + e.ts.length + 4;
    if (bytes > MAX_RESPONSE_BYTES) break;
    kept.push(e);
  }
  for (const e of kept.reverse()) emitLog(encodeLogLine(e));
}
