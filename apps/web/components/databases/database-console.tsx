"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, Play, SquareTerminal } from "lucide-react";
import type { DatabaseSummary, DbQueryResult } from "@deplyr/shared-types";
import { Button } from "@/components/ui/button";
import { FlatCard } from "@/components/ui/flat-card";
import { SectionTitle } from "@/components/ui/section-title";
import { cn } from "@/lib/cn";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const EXAMPLES = {
  postgres: [
    { label: "List tables", text: "SELECT table_schema, table_name FROM information_schema.tables\nWHERE table_schema NOT IN ('pg_catalog', 'information_schema')\nORDER BY 1, 2;" },
    { label: "Database size", text: "SELECT pg_size_pretty(pg_database_size(current_database())) AS size;" },
    { label: "Active connections", text: "SELECT state, count(*) FROM pg_stat_activity GROUP BY state;" },
  ],
  redis: [
    { label: "Server info", text: "INFO server" },
    { label: "Key count", text: "DBSIZE" },
    { label: "Some keys", text: "SCAN 0 COUNT 50" },
  ],
} as const;

/** Run SQL (Postgres) or a command (Redis) from the browser. It runs inside the
 * database's own container through the agent, so no port or tunnel is needed. */
export function DatabaseConsole({ database }: { database: DatabaseSummary }) {
  const isRedis = database.type === "redis";
  const [text, setText] = useState("");
  const [allowWrites, setAllowWrites] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DbQueryResult | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const ready = database.status === "running";

  async function run() {
    if (!text.trim() || running || !ready) return;
    setRunning(true);
    setFailure(null);
    try {
      const res = await fetch(`${API_URL}/databases/${database.id}/query`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statement: text, allowWrites }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) {
        setResult(null);
        setFailure(body?.error ?? "Couldn't run that. Try again.");
      } else {
        setResult(body as DbQueryResult);
      }
    } catch {
      setResult(null);
      setFailure("Couldn't reach Deplyr. Try again.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <FlatCard className="animate-fade-up p-6" style={{ animationDelay: "115ms" }}>
      <SectionTitle icon={SquareTerminal}>{isRedis ? "Command console" : "SQL console"}</SectionTitle>
      <p className="mb-4 text-xs leading-relaxed text-muted">
        Run {isRedis ? "Redis commands" : "queries"} right here — no tunnel or open port needed. It runs inside the database&apos;s own container.
      </p>

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-muted">Try:</span>
        {EXAMPLES[database.type].map((ex) => (
          <button
            key={ex.label}
            type="button"
            onClick={() => setText(ex.text)}
            className="rounded-full border border-border bg-surface-hover px-2.5 py-1 text-[11px] text-muted transition hover:text-foreground"
          >
            {ex.label}
          </button>
        ))}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void run();
          }
        }}
        rows={isRedis ? 2 : 5}
        spellCheck={false}
        placeholder={isRedis ? "GET mykey" : "SELECT * FROM users LIMIT 10;"}
        aria-label={isRedis ? "Redis command" : "SQL query"}
        className="w-full resize-y rounded-xl border border-border bg-surface-hover px-3 py-2.5 font-mono text-xs leading-relaxed outline-none transition placeholder:text-muted/60 focus:border-accent/60"
      />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Button onClick={run} disabled={!text.trim() || running || !ready}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" strokeWidth={2} />}
            Run
          </Button>
          <span className="hidden text-[11px] text-muted sm:inline">⌘/Ctrl + Enter</span>
        </div>
        {!isRedis ? (
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={allowWrites} onChange={(e) => setAllowWrites(e.target.checked)} className="h-3.5 w-3.5 accent-[hsl(var(--accent))]" />
            Allow changes
          </label>
        ) : null}
      </div>

      {!isRedis && allowWrites ? (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-warning/25 bg-warning/[0.06] px-3 py-2 text-xs text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          Changes are permanent. Inserts, updates, deletes and DROP statements will run for real.
        </p>
      ) : null}
      {!ready ? <p className="mt-3 text-xs text-muted">Start the database to use the console.</p> : null}
      {failure ? <p className="mt-3 text-xs text-danger">{failure}</p> : null}

      {result ? <ResultView result={result} /> : null}
    </FlatCard>
  );
}

function ResultView({ result }: { result: DbQueryResult }) {
  const took = <span className="ml-auto font-mono text-[11px] text-muted">{result.elapsedMs} ms</span>;

  if (result.kind === "error") {
    return (
      <div className="mt-4 rounded-xl border border-danger/25 bg-danger/[0.06] p-3">
        <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-danger">{result.error}</pre>
      </div>
    );
  }
  if (result.kind === "message") {
    return (
      <div className="mt-4 flex items-center gap-2 rounded-xl border border-success/25 bg-success/[0.06] px-3 py-2.5 text-xs text-success">
        <span className="font-mono">{result.message}</span>
        {took}
      </div>
    );
  }
  if (result.kind === "text") {
    return (
      <div className="mt-4 rounded-xl border border-border bg-surface-hover">
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all px-3 py-2.5 font-mono text-xs leading-relaxed">{result.text}</pre>
        <div className="flex items-center border-t border-border px-3 py-1.5 text-[11px] text-muted">
          {result.truncated ? "Output was cut short." : null}
          {took}
        </div>
      </div>
    );
  }
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-border">
      <div className="max-h-96 overflow-auto">
        <table className="w-full min-w-max border-collapse text-left font-mono text-xs">
          <thead className="sticky top-0 bg-surface-hover">
            <tr>
              {result.columns.map((c, i) => (
                <th key={`${c}-${i}`} className="whitespace-nowrap border-b border-border px-3 py-2 font-semibold">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, r) => (
              <tr key={r} className="border-b border-border/60 last:border-0">
                {row.map((cell, i) => (
                  <td key={i} className={cn("max-w-xs truncate whitespace-nowrap px-3 py-1.5", cell === "" && "text-muted")} title={cell}>
                    {cell === "" ? "∅" : cell}
                  </td>
                ))}
              </tr>
            ))}
            {result.rows.length === 0 ? (
              <tr>
                <td colSpan={Math.max(result.columns.length, 1)} className="px-3 py-3 text-muted">
                  No rows.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="flex items-center border-t border-border bg-surface-hover px-3 py-1.5 text-[11px] text-muted">
        {result.rows.length} row{result.rows.length === 1 ? "" : "s"}
        {result.truncated ? " (showing the first rows only)" : ""}
        {took}
      </div>
    </div>
  );
}
