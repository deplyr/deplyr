import type { DatabaseSummary } from "@deplyr/shared-types";
import { dbPill } from "@/lib/database-meta";
import { cn } from "@/lib/cn";

const tones = {
  success: "border-success/25 bg-success/10 text-success",
  danger: "border-danger/25 bg-danger/10 text-danger",
  warning: "border-warning/25 bg-warning/10 text-warning",
  neutral: "border-border bg-surface-hover text-muted",
};

export function DbStatusPill({ database }: { database: Pick<DatabaseSummary, "status" | "statusDetail" | "isUp"> }) {
  const pill = dbPill(database);
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", tones[pill.tone])}>
      <span className="relative flex h-1.5 w-1.5">
        {pill.pulse ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" /> : null}
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
      </span>
      {pill.label}
    </span>
  );
}
