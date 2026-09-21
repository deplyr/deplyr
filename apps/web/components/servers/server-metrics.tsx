import { RingGauge } from "@/components/dashboard/ring-gauge";
import { timeAgo } from "@/lib/time-ago";

export function ServerMetrics({
  cpuPercent,
  memPercent,
  diskPercent,
  metricsUpdatedAt,
}: {
  cpuPercent: number | null;
  memPercent: number | null;
  diskPercent: number | null;
  metricsUpdatedAt: string | null;
}) {
  if (metricsUpdatedAt === null) {
    return <p className="py-6 text-center text-sm text-muted">Waiting for the first metrics report…</p>;
  }

  return (
    <div>
      <div className="flex justify-around gap-4 py-2">
        <RingGauge label="cpu" value={cpuPercent} size={104} />
        <RingGauge label="memory" value={memPercent} size={104} />
        <RingGauge label="disk" value={diskPercent} size={104} />
      </div>
      <p className="mt-5 text-center text-xs text-muted">Updated {timeAgo(metricsUpdatedAt)}</p>
    </div>
  );
}
