import { Database, Zap, type LucideIcon } from "lucide-react";
import type { DatabaseSummary, DatabaseType } from "@deplyr/shared-types";

export const ENGINE_META: Record<
  DatabaseType,
  { label: string; icon: LucideIcon; blurb: string; cliName: string; envKey: string }
> = {
  postgres: {
    label: "PostgreSQL",
    icon: Database,
    blurb: "Relational database for your app's data.",
    cliName: "psql",
    envKey: "DATABASE_URL",
  },
  redis: {
    label: "Redis",
    icon: Zap,
    blurb: "In-memory cache, queues and sessions.",
    cliName: "redis-cli",
    envKey: "REDIS_URL",
  },
};

export type DbPill = { label: string; tone: "success" | "danger" | "warning" | "neutral"; pulse?: boolean };

/**
 * One label for "what state is this database in", folding lifecycle status
 * (what Deplyr is doing to it) together with the agent's latest health probe
 * (whether it actually answers). A running container that stops responding
 * must not read as healthy.
 */
export function dbPill(db: Pick<DatabaseSummary, "status" | "statusDetail" | "isUp">): DbPill {
  switch (db.status) {
    case "provisioning":
      return { label: db.statusDetail?.replace("…", "") ?? "Provisioning", tone: "warning", pulse: true };
    case "removing":
      return { label: "Removing", tone: "warning", pulse: true };
    case "stopped":
      return { label: "Stopped", tone: "neutral" };
    case "error":
      return { label: "Error", tone: "danger" };
    case "running":
      if (db.isUp === true) return { label: "Healthy", tone: "success" };
      if (db.isUp === false) return { label: "Unreachable", tone: "danger" };
      return { label: "Checking", tone: "neutral", pulse: true };
  }
}

export const isBusy = (db: Pick<DatabaseSummary, "status">) =>
  db.status === "provisioning" || db.status === "removing";
