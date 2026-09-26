"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

export interface Datum {
  t: number; // ms since epoch (bucket start)
  v: number | null; // plotted value (bucket average)
  max: number | null; // worst sample in the bucket
}

interface Props {
  data: Datum[];
  /** Fixed y-domain — percent charts must read against 0–100, never auto-zoom. */
  domain: [number, number];
  ticks: number[];
  format: (v: number) => string;
  label: string;
  /** Width of the visible time window; the x-axis always spans this, ending at the newest point. */
  windowMs: number;
  bucketMs: number;
  /** A labelled hairline, e.g. "4 cores" on a load chart. */
  reference?: { value: number; label: string };
  height?: number;
}

// CSS custom properties, not literal colours — same trick as ring-gauge.tsx —
// so the chart tracks the live theme instead of assuming a dark surface.
const SERIES = "hsl(var(--accent))";
const SURFACE = "hsl(var(--surface-hover))"; // dots wear a 2px ring in this colour, matching the card they sit in
const GRID = "hsl(var(--border))";
const AXIS_TEXT = "hsl(var(--muted))";
const HAIRLINE = "hsl(var(--foreground) / 0.15)";
const CROSSHAIR = "hsl(var(--foreground) / 0.25)";
const PAD = { top: 10, right: 14, bottom: 24, left: 38 };
const CHAR_W = 6.2; // ≈ width of one 10px axis digit

function formatTick(ms: number, windowMs: number): string {
  const d = new Date(ms);
  return windowMs > 86_400_000
    ? d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })
    : d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatFull(ms: number, windowMs: number): string {
  const d = new Date(ms);
  return windowMs > 86_400_000
    ? d.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })
    : d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function TimeSeriesChart({ data, domain, ticks, format, label, windowMs, bucketMs, reference, height = 150 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => entry && setWidth(entry.contentRect.width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  // Wide labels ("100 MB") need more room than the "50%" the default fits.
  const padLeft = Math.max(PAD.left, Math.max(...ticks.map((t) => format(t).length)) * CHAR_W + 14);
  const plotW = Math.max(0, width - padLeft - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const xMax = data.length ? data[data.length - 1]!.t : Date.now();
  const xMin = xMax - windowMs;
  const [yMin, yMax] = domain;

  const x = (t: number) => padLeft + ((t - xMin) / (xMax - xMin)) * plotW;
  const y = (v: number) => PAD.top + (1 - (Math.min(Math.max(v, yMin), yMax) - yMin) / (yMax - yMin)) * plotH;

  // Split into runs so a gap (server offline / agent silent) is drawn as a gap,
  // not as a straight line implying data that was never collected.
  const segments = useMemo(() => {
    const runs: Datum[][] = [];
    let run: Datum[] = [];
    let prev: Datum | null = null;
    for (const d of data) {
      if (d.v === null) continue;
      if (prev && d.t - prev.t > bucketMs * 2.5) {
        runs.push(run);
        run = [];
      }
      run.push(d);
      prev = d;
    }
    if (run.length) runs.push(run);
    return runs;
  }, [data, bucketMs]);

  const linePath = (run: Datum[]) => run.map((d, i) => `${i ? "L" : "M"}${x(d.t).toFixed(1)},${y(d.v!).toFixed(1)}`).join("");
  const areaPath = (run: Datum[]) => {
    const first = run[0]!;
    const last = run[run.length - 1]!;
    return `${linePath(run)}L${x(last.t).toFixed(1)},${y(yMin)}L${x(first.t).toFixed(1)},${y(yMin)}Z`;
  };

  const plotted = useMemo(() => data.map((d, i) => ({ d, i })).filter(({ d }) => d.v !== null), [data]);
  const last = plotted[plotted.length - 1];
  const active = hover !== null ? data[hover] : undefined;

  function nearest(clientX: number, rect: DOMRect): number | null {
    if (!plotted.length) return null;
    const px = clientX - rect.left;
    let best = plotted[0]!;
    let bestDist = Infinity;
    for (const p of plotted) {
      const dist = Math.abs(x(p.d.t) - px);
      if (dist < bestDist) {
        best = p;
        bestDist = dist;
      }
    }
    return best.i;
  }

  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    setHover(nearest(e.clientX, e.currentTarget.getBoundingClientRect()));
  }

  function onKeyDown(e: KeyboardEvent<SVGSVGElement>) {
    if (!plotted.length || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    const pos = hover === null ? plotted.length - 1 : plotted.findIndex((p) => p.i === hover);
    const next = Math.min(plotted.length - 1, Math.max(0, pos + (e.key === "ArrowRight" ? 1 : -1)));
    setHover(plotted[next]!.i);
  }

  const xTicks = Array.from({ length: 4 }, (_, i) => xMin + ((xMax - xMin) * i) / 3);
  const tipLeft = active && active.v !== null ? Math.min(Math.max(x(active.t), 70), Math.max(70, width - 70)) : 0;

  return (
    <div ref={wrapRef} className="relative" style={{ height }}>
      {width > 0 ? (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${label} over time`}
          tabIndex={0}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHover(null)}
          onKeyDown={onKeyDown}
          onBlur={() => setHover(null)}
          className="block touch-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          {/* grid + y labels */}
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={padLeft} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} stroke={GRID} strokeWidth={1} />
              <text x={padLeft - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill={AXIS_TEXT}>
                {format(tick)}
              </text>
            </g>
          ))}

          {/* x labels */}
          {xTicks.map((tick, i) => (
            <text
              key={tick}
              x={x(tick)}
              y={height - 6}
              textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
              fontSize={10}
              fill={AXIS_TEXT}
            >
              {formatTick(tick, windowMs)}
            </text>
          ))}

          {reference ? (
            <g>
              <line x1={padLeft} x2={width - PAD.right} y1={y(reference.value)} y2={y(reference.value)} stroke={HAIRLINE} strokeWidth={1} />
              {/* near the top edge the label would clip, so tuck it under the line */}
              <text
                x={width - PAD.right - 4}
                y={y(reference.value) + (y(reference.value) < PAD.top + 14 ? 12 : -5)}
                textAnchor="end"
                fontSize={10}
                fill={AXIS_TEXT}
              >
                {reference.label}
              </text>
            </g>
          ) : null}

          {/* data */}
          {segments.map((run, i) =>
            run.length > 1 ? (
              <g key={i}>
                <path d={areaPath(run)} fill={SERIES} fillOpacity={0.1} />
                <path d={linePath(run)} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              </g>
            ) : (
              <circle key={i} cx={x(run[0]!.t)} cy={y(run[0]!.v!)} r={2} fill={SERIES} />
            ),
          )}

          {/* end dot, or the hovered point + crosshair */}
          {active && active.v !== null ? (
            <g pointerEvents="none">
              <line x1={x(active.t)} x2={x(active.t)} y1={PAD.top} y2={PAD.top + plotH} stroke={CROSSHAIR} strokeWidth={1} />
              <circle cx={x(active.t)} cy={y(active.v)} r={4} fill={SERIES} stroke={SURFACE} strokeWidth={2} />
            </g>
          ) : last ? (
            <circle cx={x(last.d.t)} cy={y(last.d.v!)} r={4} fill={SERIES} stroke={SURFACE} strokeWidth={2} pointerEvents="none" />
          ) : null}
        </svg>
      ) : null}

      {active && active.v !== null ? (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-surface px-2.5 py-1.5 shadow-xl"
          style={{ left: tipLeft }}
        >
          <p className="text-[11px] text-muted">{formatFull(active.t, windowMs)}</p>
          <p className="mt-0.5 flex items-center gap-2 text-sm font-semibold">
            <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: SERIES }} />
            {format(active.v)}
            {active.max !== null && active.max > active.v ? (
              <span className="text-[11px] font-normal text-muted">max {format(active.max)}</span>
            ) : null}
          </p>
        </div>
      ) : null}
    </div>
  );
}
