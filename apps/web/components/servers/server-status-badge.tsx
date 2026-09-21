import type { ServerStatus } from "@deplyr/shared-types";
import { Badge } from "@/components/ui/badge";

const STATUS_CONFIG: Record<
  ServerStatus,
  { label: string; tone: "neutral" | "warning" | "success" | "danger" }
> = {
  pending: { label: "Pending", tone: "neutral" },
  installing: { label: "Installing", tone: "warning" },
  connected: { label: "Connected", tone: "success" },
  error: { label: "Error", tone: "danger" },
};

export function ServerStatusBadge({ status }: { status: ServerStatus }) {
  const { label, tone } = STATUS_CONFIG[status];
  return <Badge tone={tone}>{label}</Badge>;
}
