import type { HealthSummary } from "@argo/shared-types";
import { cn } from "@/lib/cn";

export function HealthIndicator({ health }: { health: HealthSummary }) {
  if (health.isHealthy === null) return null;

  return (
    <div className="flex items-center gap-1.5 text-sm">
      <span
        className={cn("h-2 w-2 rounded-full", health.isHealthy ? "bg-success" : "bg-danger")}
      />
      <span className={health.isHealthy ? "text-success" : "text-danger"}>
        {health.isHealthy ? "Healthy" : "Unhealthy"}
      </span>
    </div>
  );
}
