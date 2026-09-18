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
    return <p className="text-sm text-muted">Waiting for the first metrics report...</p>;
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      <Metric label="CPU" value={cpuPercent ?? 0} />
      <Metric label="Memory" value={memPercent ?? 0} />
      <Metric label="Disk" value={diskPercent ?? 0} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}%</p>
    </div>
  );
}
