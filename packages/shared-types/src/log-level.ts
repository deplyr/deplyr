export type LogLevel = "error" | "warn" | "info" | "debug";

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

/** Terminal colour codes mean nothing in the browser and break pattern matching. */
export const stripAnsi = (text: string): string => text.replace(ANSI, "");

const NUMERIC_JSON: Record<number, LogLevel> = { 10: "debug", 20: "debug", 30: "info", 40: "warn", 50: "error", 60: "error" };
const NAMED: Record<string, LogLevel> = {
  fatal: "error", panic: "error", critical: "error", crit: "error", error: "error", err: "error", severe: "error",
  warn: "warn", warning: "warn",
  info: "info", log: "info", notice: "info",
  debug: "debug", trace: "debug", verbose: "debug",
};

const named = (word: string | undefined): LogLevel | null => (word ? (NAMED[word.toLowerCase()] ?? null) : null);

/**
 * Best-effort guess at how serious a log line is, from how common servers
 * format it. Deliberately content-based: it never looks at stdout vs stderr,
 * because plenty of software (Postgres, nginx) writes *everything* to stderr.
 * Returns null when nothing recognisable is there — the UI then shows the
 * line plainly rather than guessing.
 */
export function detectLogLevel(rawText: string): LogLevel | null {
  const text = stripAnsi(rawText);

  // structured (pino / bunyan / winston-json): "level":"error" or "level":50
  const json = /"level"\s*:\s*(?:"([A-Za-z]+)"|(\d+))/.exec(text);
  if (json) {
    const level = json[1] ? named(json[1]) : NUMERIC_JSON[Number(json[2])];
    if (level) return level;
  }

  // logfmt: level=warn
  const logfmt = /\blevel=("?)([A-Za-z]+)\1/.exec(text);
  if (logfmt) {
    const level = named(logfmt[2]);
    if (level) return level;
  }

  // Postgres: "2026-09-21 18:00:00.123 UTC [1] LOG:  message"
  const pg = /\[\d+\]\s+(PANIC|FATAL|ERROR|WARNING|LOG|NOTICE|INFO|DEBUG\d?|DETAIL|HINT|STATEMENT|CONTEXT):/.exec(text);
  if (pg) {
    const tag = pg[1]!;
    if (tag === "LOG" && /\bduration:\s*[\d.]+\s*ms\b/.test(text)) return "warn"; // a slow query
    if (tag === "DETAIL" || tag === "HINT" || tag === "STATEMENT" || tag === "CONTEXT") return null; // continuation lines
    return named(tag.replace(/\d+$/, ""));
  }

  // Redis: "1:M 21 Sep 2026 18:00:00.123 * message" — . debug, - verbose, * notice, # warning
  const redis = /\d{2}:\d{2}:\d{2}\.\d{3}\s([.\-*#])\s/.exec(text);
  if (redis) {
    if (redis[1] === "#") return /\b(error|fail|denied|refus|cannot|can't)/i.test(text) ? "error" : "warn";
    return redis[1] === "*" ? "info" : "debug";
  }

  // an explicit level word — Nest ("ERROR [Ctx]"), Python, Java, most others
  if (/\b(FATAL|CRITICAL|PANIC|ERROR|ERR)\b/.test(text)) return "error";
  if (/\b(WARN|WARNING)\b/.test(text)) return "warn";
  if (/\bINFO\b/.test(text)) return "info";
  if (/\b(DEBUG|TRACE|VERBOSE)\b/.test(text)) return "debug";

  // no level word: how errors announce themselves is still recognisable —
  // "Error: …", "TypeError: …", "com.x.FooException: …", and Node's errno codes.
  if (/^\s*(?:[A-Za-z_.$]+)?(?:Error|Exception):/.test(text) || /\bE(?:CONNREFUSED|CONNRESET|NOENT|ADDRINUSE|ACCES|PIPE|TIMEDOUT|HOSTUNREACH|NOTFOUND)\b/.test(text)) {
    return "error";
  }

  // no level word: stack frames and well-known failure phrases still say a lot
  if (/^\s+at\s+\S.*:\d+:\d+\)?\s*$/.test(text) || /^\s+File ".*", line \d+/.test(text)) return "error";
  if (
    /\b(exception|traceback|unhandled|uncaught|segmentation fault|out of memory|connection refused|permission denied|authentication failed)\b/i.test(text) ||
    /(?<!\b0 )\bfailed (?:to|with)\b/i.test(text)
  ) {
    return "error";
  }
  if (/\b(timed? ?out|timeout|deprecated|retrying)\b/i.test(text)) return "warn";

  return null;
}
