import type { HealthSummary } from "@deplyr/shared-types";
import { cn } from "@/lib/cn";

export function HealthIndicator({ health }: { health: HealthSummary }) {
  if (health.isHealthy === null) return null;
  const ok = health.isHealthy;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        ok ? "border-success/25 bg-success/10 text-success" : "border-danger/25 bg-danger/10 text-danger",
      )}
    >
      <span className="relative flex h-1.5 w-1.5">
        {ok ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" /> : null}
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
      </span>
      Health: {ok ? "Healthy" : "Down"}
    </span>
  );
}
