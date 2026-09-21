"use client";

import { METRICS_RANGES, type MetricsRange } from "@deplyr/shared-types";
import { cn } from "@/lib/cn";

export function RangeTabs({ value, onChange }: { value: MetricsRange; onChange: (r: MetricsRange) => void }) {
  return (
    <div role="tablist" aria-label="Time range" className="inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
      {METRICS_RANGES.map((r) => (
        <button
          key={r}
          role="tab"
          aria-selected={value === r}
          onClick={() => onChange(r)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-medium transition",
            value === r ? "bg-accent text-accent-foreground shadow" : "text-muted hover:text-foreground",
          )}
        >
          {r}
        </button>
      ))}
    </div>
  );
}
