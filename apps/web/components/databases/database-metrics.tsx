"use client";

import { useEffect, useMemo, useState } from "react";
import { LineChart, Table2 } from "lucide-react";
import type { DatabaseMetricsHistory, DatabaseType, MetricsRange } from "@deplyr/shared-types";
import { RangeTabs } from "@/components/charts/range-tabs";
import { TimeSeriesChart, type Datum } from "@/components/charts/time-series-chart";
import { niceCeil } from "@/lib/nice-ceil";
import { cn } from "@/lib/cn";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const REFRESH_MS = 30_000;
const WINDOW_MS: Record<MetricsRange, number> = { "1h": 3_600_000, "6h": 21_600_000, "24h": 86_400_000, "7d": 604_800_000 };
const RANGE_LABEL: Record<MetricsRange, string> = { "1h": "hour", "6h": "6 hours", "24h": "24 hours", "7d": "7 days" };

const pct = (v: number) => `${v >= 99.95 ? 100 : Math.round(v * 10) / 10}%`;
const plain = (v: number) => (v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10));
export const fmtMb = (v: number) => (v >= 1024 ? `${(v / 1024).toFixed(1)} GB` : `${plain(v)} MB`);

interface ChartDef {
  key: string;
  title: string;
  format: (v: number) => string;
  /** null = fixed 0–100; otherwise scale to the data, never below `floor`. */
  scale: { fixed: [number, number] } | { floor: number };
  reference?: { value: number; label: string };
}

function definitions(type: DatabaseType, memoryLimitMb: number | null, maxConnections: number | null): ChartDef[] {
  if (type === "redis") {
    const maxmemory = memoryLimitMb ? Math.floor(memoryLimitMb * 0.75) : null;
    return [
      { key: "hitRate", title: "Cache hit rate", format: pct, scale: { fixed: [0, 100] } },
      {
        key: "memUsedMb",
        title: "Memory used",
        format: fmtMb,
        scale: { floor: maxmemory ?? 1 },
        reference: maxmemory ? { value: maxmemory, label: `maxmemory ${fmtMb(maxmemory)}` } : undefined,
      },
      { key: "opsPerSec", title: "Operations / sec", format: plain, scale: { floor: 10 } },
      { key: "clients", title: "Connected clients", format: plain, scale: { floor: 5 } },
    ];
  }
  return [
    {
      key: "connections",
      title: "Connections",
      format: plain,
      scale: { floor: maxConnections ?? 10 },
      reference: maxConnections ? { value: maxConnections, label: `max ${maxConnections}` } : undefined,
    },
    { key: "cacheHitRatio", title: "Cache hit ratio", format: pct, scale: { fixed: [0, 100] } },
    { key: "tps", title: "Transactions / sec", format: plain, scale: { floor: 5 } },
    { key: "sizeMb", title: "Database size", format: fmtMb, scale: { floor: 10 } },
  ];
}

export function DatabaseMetrics({
  databaseId,
  type,
  memoryLimitMb,
  maxConnections,
}: {
  databaseId: string;
  type: DatabaseType;
  memoryLimitMb: number | null;
  maxConnections: number | null;
}) {
  const [range, setRange] = useState<MetricsRange>("1h");
  const [history, setHistory] = useState<DatabaseMetricsHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [table, setTable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchHistory() {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/databases/${databaseId}/metrics?range=${range}`, { credentials: "include" });
        if (!res.ok) throw new Error();
        const body: DatabaseMetricsHistory = await res.json();
        if (!cancelled) {
          setHistory(body);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchHistory();
    const timer = setInterval(fetchHistory, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [databaseId, range]);

  const points = history?.points ?? [];
  const shownRange = history?.range ?? range;
  const defs = useMemo(() => definitions(type, memoryLimitMb, maxConnections), [type, memoryLimitMb, maxConnections]);

  const availability = points.length ? (points.reduce((a, p) => a + p.up, 0) / points.length) * 100 : null;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <RangeTabs value={range} onChange={setRange} />
        <div className="flex items-center gap-3">
          {availability !== null ? (
            <span className="text-xs text-muted">
              Availability <span className={cn("font-semibold", availability < 99 ? "text-warning" : "text-foreground")}>{pct(availability)}</span> · last {RANGE_LABEL[shownRange]}
            </span>
          ) : null}
          <button
            onClick={() => setTable((t) => !t)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-muted transition hover:bg-white/[0.05] hover:text-foreground"
          >
            {table ? <LineChart className="h-3.5 w-3.5" strokeWidth={1.75} /> : <Table2 className="h-3.5 w-3.5" strokeWidth={1.75} />}
            {table ? "Charts" : "Table"}
          </button>
        </div>
      </div>

      {failed && !history ? (
        <p className="py-10 text-center text-sm text-muted">Couldn&apos;t load history. It will retry shortly.</p>
      ) : history === null ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-xl bg-white/[0.04]" />
          ))}
        </div>
      ) : points.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <p className="text-sm font-medium">No samples in the last {RANGE_LABEL[shownRange]}</p>
          <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted">The agent samples every 30 seconds while the database is running.</p>
        </div>
      ) : table ? (
        <div className={cn("max-h-96 overflow-auto rounded-xl border border-white/[0.07] transition-opacity", loading && "opacity-60")}>
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-[#0c0c10] text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Up</th>
                {defs.map((d) => (
                  <th key={d.key} className="px-3 py-2 font-medium">
                    {d.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {[...points].reverse().map((p) => (
                <tr key={p.t} className="border-t border-white/[0.05]">
                  <td className="px-3 py-1.5 text-muted">
                    {new Date(p.t).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}
                  </td>
                  <td className="px-3 py-1.5">{p.up >= 0.999 ? "yes" : `${Math.round(p.up * 100)}%`}</td>
                  {defs.map((d) => {
                    const v = p.values[d.key];
                    return (
                      <td key={d.key} className="px-3 py-1.5">
                        {v === null || v === undefined ? "—" : d.format(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={cn("grid gap-4 transition-opacity sm:grid-cols-2", loading && "opacity-60")}>
          {defs.map((d) => {
            const data: Datum[] = points.map((p) => ({ t: new Date(p.t).getTime(), v: p.values[d.key] ?? null, max: p.max[d.key] ?? null }));
            const vals = data.map((x) => x.v).filter((v): v is number => v !== null);
            const maxes = data.map((x) => x.max).filter((v): v is number => v !== null);
            const latest = [...data].reverse().find((x) => x.v !== null)?.v ?? null;
            const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
            const peak = maxes.length ? Math.max(...maxes) : null;

            const dataMax = peak ?? 0;
            const top = "fixed" in d.scale ? d.scale.fixed[1] : niceCeil(Math.max(dataMax * 1.15, d.scale.floor));
            const domain: [number, number] = "fixed" in d.scale ? d.scale.fixed : [0, top];

            return (
              <section key={d.key} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xs text-muted">{d.title}</h3>
                    <p className="mt-1 font-sans text-2xl font-semibold leading-none">{latest === null ? "—" : d.format(latest)}</p>
                  </div>
                  {avg !== null ? (
                    <p className="pt-0.5 text-right text-[11px] leading-relaxed text-muted">
                      avg {d.format(avg)}
                      <br />
                      max {peak === null ? "—" : d.format(peak)}
                    </p>
                  ) : null}
                </div>
                <TimeSeriesChart
                  data={data}
                  domain={domain}
                  ticks={"fixed" in d.scale ? [0, 50, 100] : [0, top / 2, top]}
                  format={d.format}
                  label={d.title}
                  windowMs={WINDOW_MS[shownRange]}
                  bucketMs={(history?.bucketSeconds ?? 60) * 1000}
                  reference={d.reference}
                  height={140}
                />
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
