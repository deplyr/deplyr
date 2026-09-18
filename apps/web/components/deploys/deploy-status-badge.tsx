import type { DeployStatus } from "@argo/shared-types";
import { Badge } from "@/components/ui/badge";

const STATUS_CONFIG: Record<
  DeployStatus,
  { label: string; tone: "neutral" | "warning" | "success" | "danger" }
> = {
  queued: { label: "Queued", tone: "neutral" },
  running: { label: "Running", tone: "warning" },
  success: { label: "Live", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
};

export function DeployStatusBadge({ status }: { status: DeployStatus }) {
  const { label, tone } = STATUS_CONFIG[status];
  return <Badge tone={tone}>{label}</Badge>;
}
