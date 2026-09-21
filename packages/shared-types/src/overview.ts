export type ActivityKind = "deploy" | "database" | "alert" | "server" | "project";
export type ActivityTone = "success" | "danger" | "warning" | "neutral";

/** One row of the dashboard's cross-project activity feed. */
export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  tone: ActivityTone;
  title: string;
  detail: string | null;
  at: string; // ISO timestamp
  href: string | null;
}

export type AppHealthStatus = "healthy" | "unhealthy" | "unknown";

export interface AppHealthRow {
  projectId: string;
  name: string;
  subdomain: string;
  status: AppHealthStatus;
  lastCheckedAt: string | null;
}

export interface DatabaseRow {
  id: string;
  serverId: string;
  name: string;
  projectId: string | null;
  projectName: string | null;
  type: "postgres" | "redis";
  status: "provisioning" | "running" | "stopped" | "removing" | "error";
  isUp: boolean | null;
  createdAt: string;
}

/** What GET /overview returns — everything the dashboard's lower panels need. */
export interface OverviewSummary {
  events: ActivityEvent[];
  health: AppHealthRow[];
  databases: DatabaseRow[];
}
