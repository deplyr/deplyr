"use client";

import { useEffect, useMemo, useState } from "react";
import { Table2, LineChart } from "lucide-react";
import type { MetricsRange, ServerMetricsHistory } from "@deplyr/shared-types";
import { RangeTabs } from "@/components/charts/range-tabs";
import { TimeSeriesChart, type Datum } from "@/components/charts/time-series-chart";
import { niceCeil } from "@/lib/nice-ceil";
import { cn } from "@/lib/cn";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const REFRESH_MS = 30_000;

const WINDOW_MS: Record<MetricsRange, number> = { "1h": 3_600_000, "6h": 21_600_000, "24h": 86_400_000, "7d": 604_800_000 };
const RANGE_LABEL: Record<MetricsRange, string> = { "1h": "1 hour", "6h": "6 hours", "24h": "24 hours", "7d": "7 days" };

const pct = (v: number) => `${Math.round(v)}%`;
const load = (v: number) => (v >= 10 ? v.toFixed(1) : v.toFixed(2));

interface Metric {
  key: "cpu" | "mem" | "disk" | "load";
  title: string;
  format: (v: number) => string;
  domain: [number, number];
  ticks: number[];
  reference?: { value: number; label: string };
}

function stat(values: Array<number | null>): { avg: number; peak: number } | null {
  const nums = values.filter((v): v is number => v !== null);
  if (!nums.length) return null;
  return { avg: nums.reduce((a, b) => a + b, 0) / nums.length, peak: Math.max(...nums) };
}

export function MetricsHistory({ serverId, cpuCores }: { serverId: string; cpuCores: number | null }) {
  const [range, setRange] = useState<MetricsRange>("1h");
  const [history, setHistory] = useState<ServerMetricsHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [table, setTable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchHistory() {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/servers/${serverId}/metrics?range=${range}`, { credentials: "include" });
        if (!res.ok) throw new Error();
        const body: ServerMetricsHistory = await res.json();
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
  }, [serverId, range]);

  const points = history?.points ?? [];
  // History is for the range we asked for; while a new range loads we keep
  // showing the old one, dimmed, rather than flashing a skeleton.
  const shownRange = history?.range ?? range;

  const metrics: Metric[] = useMemo(() => {
    const maxLoad = Math.max(0, ...points.map((p) => p.loadMax ?? 0));
    const loadTop = niceCeil(Math.max(maxLoad * 1.15, cpuCores ?? 1));
    return [
      { key: "cpu", title: "CPU", format: pct, domain: [0, 100], ticks: [0, 50, 100] },
      { key: "mem", title: "Memory", format: pct, domain: [0, 100], ticks: [0, 50, 100] },
      { key: "disk", title: "Disk", format: pct, domain: [0, 100], ticks: [0, 50, 100] },
      {
        key: "load",
        title: "Load average (1 min)",
        format: load,
        domain: [0, loadTop],
        ticks: [0, loadTop / 2, loadTop],
        reference: cpuCores ? { value: cpuCores, label: `${cpuCores} cores` } : undefined,
      },
    ];
  }, [points, cpuCores]);

  const seriesFor = (key: Metric["key"]): Datum[] =>
    points.map((p) => ({
      t: new Date(p.t).getTime(),
      v: p[key],
      max: p[`${key}Max` as "cpuMax" | "memMax" | "diskMax" | "loadMax"],
    }));

  return (
    <div>
      {/* one filter row, above the charts it scopes */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <RangeTabs value={range} onChange={setRange} />
        <button
          onClick={() => setTable((t) => !t)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-muted transition hover:bg-white/[0.05] hover:text-foreground"
        >
          {table ? <LineChart className="h-3.5 w-3.5" strokeWidth={1.75} /> : <Table2 className="h-3.5 w-3.5" strokeWidth={1.75} />}
          {table ? "Charts" : "Table"}
        </button>
      </div>

      {failed && !history ? (
        <p className="py-10 text-center text-sm text-muted">Couldn&apos;t load history. It will retry shortly.</p>
      ) : history && points.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <p className="text-sm font-medium">No history for the last {RANGE_LABEL[shownRange]}</p>
          <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted">
            Charts fill in as the agent reports, about every 15 seconds.
          </p>
        </div>
      ) : history === null ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-xl bg-white/[0.04]" />
          ))}
        </div>
      ) : table ? (
        <div className={cn("max-h-96 overflow-auto rounded-xl border border-white/[0.07] transition-opacity", loading && "opacity-60")}>
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-[#0c0c10] text-muted">
              <tr>
                {["Time", "CPU", "Memory", "Disk", "Load"].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium">
                    {h}
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
                  <td className="px-3 py-1.5">{pct(p.cpu)}</td>
                  <td className="px-3 py-1.5">{pct(p.mem)}</td>
                  <td className="px-3 py-1.5">{pct(p.disk)}</td>
                  <td className="px-3 py-1.5">{p.load === null ? "—" : load(p.load)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={cn("grid gap-4 transition-opacity sm:grid-cols-2", loading && "opacity-60")}>
          {metrics.map((m) => {
            const data = seriesFor(m.key);
            const s = stat(data.map((d) => d.v));
            const peak = stat(data.map((d) => d.max))?.peak ?? null;
            const latest = [...data].reverse().find((d) => d.v !== null)?.v ?? null;
            if (m.key === "load" && !s) return null; // agent too old to report load
            return (
              <section key={m.key} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xs text-muted">{m.title}</h3>
                    <p className="mt-1 font-sans text-2xl font-semibold leading-none">{latest === null ? "—" : m.format(latest)}</p>
                  </div>
                  {s ? (
                    <p className="pt-0.5 text-right text-[11px] leading-relaxed text-muted">
                      avg {m.format(s.avg)}
                      <br />
                      max {peak === null ? "—" : m.format(peak)}
                    </p>
                  ) : null}
                </div>
                <TimeSeriesChart
                  data={data}
                  domain={m.domain}
                  ticks={m.ticks}
                  format={m.format}
                  label={m.title}
                  windowMs={WINDOW_MS[shownRange]}
                  bucketMs={(history?.bucketSeconds ?? 60) * 1000}
                  reference={m.reference}
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
