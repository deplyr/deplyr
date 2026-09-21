"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  Check,
  Clock,
  Copy,
  Download,
  Pause,
  Play,
  RefreshCw,
  Search,
  ServerOff,
  Terminal,
  WrapText,
} from "lucide-react";
import { detectLogLevel, stripAnsi, type ContainerLogs, type ContainerState, type LogLevel, type LogLine } from "@deplyr/shared-types";
import { cn } from "@/lib/cn";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const INITIAL_TAIL = 200;
const POLL_TAIL = 1000;
const POLL_MS = 3000;
// The browser is a viewer, not an archive: past this the oldest lines fall off.
const MAX_ROWS = 2000;
const PIN_TOLERANCE_PX = 24;

interface Row {
  key: string;
  ts: string;
  stream: LogLine["stream"];
  text: string;
  level: LogLevel | null;
}

type Status = "loading" | "ok" | "offline" | "error";

const LEVEL_STYLE: Record<LogLevel, string> = {
  error: "border-danger bg-danger/[0.07] text-red-200",
  warn: "border-warning bg-warning/[0.06] text-amber-100",
  info: "border-transparent text-foreground/85",
  debug: "border-transparent text-muted/70",
};

const toRow = (line: LogLine): Row => {
  const text = stripAnsi(line.text);
  return { key: `${line.ts}|${line.stream}|${text}`, ts: line.ts, stream: line.stream, text, level: detectLogLevel(text) };
};

function clock(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return `${d.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const parts: Array<{ text: string; hit: boolean }> = [];
  let i = 0;
  while (i < text.length) {
    const at = lower.indexOf(q, i);
    if (at === -1) {
      parts.push({ text: text.slice(i), hit: false });
      break;
    }
    if (at > i) parts.push({ text: text.slice(i, at), hit: false });
    parts.push({ text: text.slice(at, at + q.length), hit: true });
    i = at + q.length;
  }
  return (
    <>
      {parts.map((p, n) => (
        <Fragment key={n}>{p.hit ? <mark className="rounded-sm bg-accent/30 px-px text-foreground">{p.text}</mark> : p.text}</Fragment>
      ))}
    </>
  );
}

function ToolButton({
  onClick,
  pressed,
  label,
  children,
  disabled,
}: {
  onClick: () => void;
  pressed?: boolean;
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition disabled:pointer-events-none disabled:opacity-40",
        pressed ? "border-accent/50 bg-accent/15 text-accent" : "border-white/10 text-muted hover:bg-white/[0.06] hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

const STATE_PILL: Record<ContainerState, { label: string; tone: string }> = {
  running: { label: "Running", tone: "border-success/25 bg-success/10 text-success" },
  stopped: { label: "Stopped", tone: "border-white/10 bg-white/[0.04] text-muted" },
  missing: { label: "Not found", tone: "border-warning/25 bg-warning/10 text-warning" },
};

export function LogViewer({
  endpoint,
  filename = "container",
}: {
  /** Path on the API that returns ContainerLogs, e.g. `/databases/<id>/logs`. */
  endpoint: string;
  /** Prefix for downloaded files. */
  filename?: string;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [state, setState] = useState<ContainerState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [follow, setFollow] = useState(true);
  const [wrap, setWrap] = useState(true);
  const [showTime, setShowTime] = useState(true);
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [pinned, setPinned] = useState(true);
  const [copied, setCopied] = useState(false);

  const scroller = useRef<HTMLDivElement>(null);
  const cursor = useRef<string | null>(null);
  const seen = useRef<Set<string>>(new Set());

  const load = useCallback(
    async (mode: "initial" | "more") => {
      setBusy(true);
      try {
        const qs = new URLSearchParams({ tail: String(mode === "initial" || !cursor.current ? INITIAL_TAIL : POLL_TAIL) });
        if (mode === "more" && cursor.current) qs.set("since", cursor.current);
        const res = await fetch(`${API_URL}${endpoint}?${qs}`, { credentials: "include" });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          setErrorText(body?.error ?? "Couldn't load logs.");
          setStatus(res.status === 503 ? "offline" : "error");
          return;
        }
        const data = body as ContainerLogs;
        setState(data.containerState);
        setMessage(data.message);
        setStatus("ok");
        setErrorText(null);
        if (data.nextSince) cursor.current = data.nextSince;

        const fresh = data.lines.map(toRow).filter((r) => !seen.current.has(r.key));
        if (fresh.length > 0) {
          for (const r of fresh) seen.current.add(r.key);
          setRows((prev) => {
            const next = [...prev, ...fresh];
            if (next.length <= MAX_ROWS) return next;
            const trimmed = next.slice(-MAX_ROWS);
            seen.current = new Set(trimmed.map((r) => r.key));
            return trimmed;
          });
        }
      } catch {
        setErrorText("Couldn't reach the server.");
        setStatus("error");
      } finally {
        setBusy(false);
      }
    },
    [endpoint],
  );

  // Fresh viewer per endpoint.
  useEffect(() => {
    cursor.current = null;
    seen.current = new Set();
    setRows([]);
    setStatus("loading");
    load("initial");
  }, [load]);

  // "Follow" = poll for newer lines. Paused while the tab is hidden.
  useEffect(() => {
    if (!follow || status === "loading") return;
    const tick = () => {
      if (document.visibilityState === "visible") load("more");
    };
    const timer = setInterval(tick, POLL_MS);
    return () => clearInterval(timer);
  }, [follow, status, load]);

  const q = query.trim();
  const visible = useMemo(() => {
    const needle = q.toLowerCase();
    return rows.filter((r) => (!problemsOnly || r.level === "error" || r.level === "warn") && (!needle || r.text.toLowerCase().includes(needle)));
  }, [rows, q, problemsOnly]);

  // Stick to the newest line — unless the reader has scrolled up to look at something.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && pinned) el.scrollTop = el.scrollHeight;
  }, [visible, pinned]);

  const onScroll = () => {
    const el = scroller.current;
    if (el) setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < PIN_TOLERANCE_PX);
  };

  const jumpToLatest = () => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
    setPinned(true);
  };

  const asText = () => visible.map((r) => `${r.ts} ${r.text}`).join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(asText());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — nothing useful to do */
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([asText() + "\n"], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}-${new Date().toISOString().replace(/[:.]/g, "-")}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const retry = () => {
    setStatus("loading");
    load("initial");
  };

  const problems = rows.filter((r) => r.level === "error" || r.level === "warn").length;

  return (
    <div>
      {/* controls */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[10rem] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" strokeWidth={1.75} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter lines…"
            aria-label="Filter log lines"
            className="h-8 w-full rounded-lg border border-white/10 bg-white/[0.04] pl-9 pr-3 text-xs text-foreground placeholder:text-muted/70 transition focus:border-accent/60 focus:outline-none focus:ring-4 focus:ring-accent/10"
          />
        </div>
        <ToolButton onClick={() => setProblemsOnly((v) => !v)} pressed={problemsOnly} label="Show only errors and warnings">
          <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.75} />
          Problems{problems > 0 ? ` (${problems})` : ""}
        </ToolButton>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <ToolButton onClick={() => setFollow((v) => !v)} pressed={follow} label={follow ? "Pause live updates" : "Follow live output"}>
            {follow ? <Pause className="h-3.5 w-3.5" strokeWidth={1.75} /> : <Play className="h-3.5 w-3.5" strokeWidth={1.75} />}
            Follow
          </ToolButton>
          {!follow ? (
            <ToolButton onClick={() => load("more")} label="Fetch new lines now" disabled={busy}>
              <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} strokeWidth={1.75} />
              Refresh
            </ToolButton>
          ) : null}
          <ToolButton onClick={() => setWrap((v) => !v)} pressed={wrap} label="Wrap long lines">
            <WrapText className="h-3.5 w-3.5" strokeWidth={1.75} />
            Wrap
          </ToolButton>
          <ToolButton onClick={() => setShowTime((v) => !v)} pressed={showTime} label="Show timestamps">
            <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />
            Time
          </ToolButton>
          <ToolButton onClick={copy} label="Copy visible lines" disabled={visible.length === 0}>
            {copied ? <Check className="h-3.5 w-3.5 text-success" strokeWidth={2.5} /> : <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />}
            {copied ? "Copied" : "Copy"}
          </ToolButton>
          <ToolButton onClick={download} label="Download visible lines as a file" disabled={visible.length === 0}>
            <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
            Download
          </ToolButton>
        </div>
      </div>

      {/* status line */}
      <div className="mb-2 flex flex-wrap items-center gap-3 text-[11px] text-muted">
        {state ? <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 font-medium", STATE_PILL[state].tone)}>{STATE_PILL[state].label}</span> : null}
        <span>
          {q || problemsOnly ? `${visible.length} of ${rows.length} lines` : `${rows.length} ${rows.length === 1 ? "line" : "lines"}`}
        </span>
        {follow && status === "ok" && state === "running" ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
            live
          </span>
        ) : null}
        {status === "error" && rows.length > 0 ? <span className="text-danger">{errorText}</span> : null}
        {status === "offline" && rows.length > 0 ? <span className="text-warning">{errorText}</span> : null}
      </div>

      {state === "stopped" && rows.length > 0 ? (
        <p className="mb-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-muted">
          This container is stopped — showing its last output.
        </p>
      ) : null}

      {/* terminal */}
      <div className="relative">
        <div
          ref={scroller}
          onScroll={onScroll}
          role="log"
          aria-live="off"
          aria-label="Container log output"
          tabIndex={0}
          className={cn(
            "h-[26rem] rounded-xl border border-white/10 bg-[#07070a] py-2 font-mono text-[12px] leading-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
            wrap ? "overflow-y-auto overflow-x-hidden" : "overflow-auto",
          )}
        >
          {status === "loading" ? (
            <div className="space-y-2 px-3 py-2" aria-hidden>
              {[70, 92, 55, 80, 40].map((w, i) => (
                <div key={i} className="h-3 animate-pulse rounded bg-white/[0.06]" style={{ width: `${w}%` }} />
              ))}
            </div>
          ) : status === "offline" && rows.length === 0 ? (
            <Placeholder icon={ServerOff} title="Can't reach the server's agent" body={errorText ?? "Logs can't be fetched right now."} action={<RetryButton onClick={retry} />} />
          ) : status === "error" && rows.length === 0 ? (
            <Placeholder icon={AlertTriangle} title="Couldn't load logs" body={errorText ?? "Something went wrong."} action={<RetryButton onClick={retry} />} />
          ) : rows.length === 0 ? (
            <Placeholder
              icon={Terminal}
              title={state === "missing" ? "No container to read logs from" : "No log output yet"}
              body={message ?? (state === "stopped" ? "This container is stopped and never printed anything." : "Nothing has been printed yet. New lines appear here as they arrive.")}
            />
          ) : visible.length === 0 ? (
            <Placeholder icon={Search} title="No lines match" body={q ? `Nothing contains “${q}”.` : "No errors or warnings in what's loaded."} />
          ) : (
            <ul className={cn("min-w-full", !wrap && "w-max")}>
              {visible.map((r) => (
                <li key={r.key} className={cn("flex gap-3 border-l-2 px-3", LEVEL_STYLE[r.level ?? "info"])}>
                  {showTime ? <span className="shrink-0 select-none text-muted/50 tabular-nums">{clock(r.ts)}</span> : null}
                  <span className={cn("min-w-0 flex-1", wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre")}>
                    <Highlight text={r.text} query={q} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!pinned && visible.length > 0 ? (
          <button
            type="button"
            onClick={jumpToLatest}
            className="absolute bottom-3 right-4 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-[#15151a]/95 px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur transition hover:bg-[#1c1c22]"
          >
            <ArrowDown className="h-3.5 w-3.5" strokeWidth={2} />
            Jump to latest
          </button>
        ) : null}
      </div>
    </div>
  );
}

function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-white/[0.06]">
      <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
      Try again
    </button>
  );
}

function Placeholder({
  icon: Icon,
  title,
  body,
  action,
  spin,
}: {
  icon: typeof Search;
  title: string;
  body: string;
  action?: React.ReactNode;
  spin?: boolean;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center font-sans">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.05] text-muted">
        <Icon className={cn("h-5 w-5", spin && "animate-spin")} strokeWidth={1.5} />
      </span>
      <p className="mt-3 text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted">{body}</p>
      {action}
    </div>
  );
}
