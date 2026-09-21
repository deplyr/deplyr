import { Boxes, Database, Rocket, Server, Siren, type LucideIcon } from "lucide-react";
import type { ActivityKind, ActivityTone } from "@deplyr/shared-types";

export const activityIcons: Record<ActivityKind, LucideIcon> = {
  deploy: Rocket,
  database: Database,
  alert: Siren,
  server: Server,
  project: Boxes,
};

export const activityTones: Record<ActivityTone, string> = {
  success: "bg-success/10 text-success ring-success/25",
  danger: "bg-danger/10 text-danger ring-danger/25",
  warning: "bg-warning/10 text-warning ring-warning/25",
  neutral: "bg-white/[0.05] text-muted ring-white/10",
};
