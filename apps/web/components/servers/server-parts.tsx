import type { Globe } from "lucide-react";
import { cn } from "@/lib/cn";

export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3_600);
  const m = Math.floor((seconds % 3_600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export const gb = (mb: number) => (mb / 1024 >= 10 ? Math.round(mb / 1024) : (mb / 1024).toFixed(1));

function usageTone(pct: number | null) {
  if (pct === null) return "bg-white/10";
  return pct > 90 ? "bg-danger" : pct > 75 ? "bg-warning" : "bg-accent";
}

export function UsageBar({ label, value, hint }: { label: string; value: number | null; hint: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="font-mono text-muted">{value === null ? "—" : `${Math.round(value)}%`}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
        <div className={cn("h-full rounded-full transition-all duration-700", usageTone(value))} style={{ width: `${value ?? 0}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-muted">{hint}</p>
    </div>
  );
}

export function InfoRow({ icon: Icon, label, children }: { icon: typeof Globe; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <Icon className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} />
      <span className="text-xs text-muted">{label}</span>
      <span className="ml-auto flex min-w-0 items-center gap-1 text-right text-xs font-medium">{children}</span>
    </div>
  );
}
