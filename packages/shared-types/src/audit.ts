export const AUDIT_CATEGORIES = ["deploy", "database", "server", "project", "secret", "alert"] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export type AuditStatus = "success" | "failure" | "info";
export type AuditActor = "user" | "system" | "agent";

/** One line of the activity log, as the API returns it. */
export interface AuditEventDTO {
  id: string;
  action: string;
  /** Text before the first dot of `action` — what the UI filters on. */
  category: string;
  status: AuditStatus;
  actor: AuditActor;
  summary: string;
  detail: string | null;
  serverId: string | null;
  serverName: string | null;
  resourceType: string | null;
  resourceId: string | null;
  resourceName: string | null;
  createdAt: string;
}

/** Newest first; pass `nextBefore` back as `?before=` for the next page. */
export interface AuditPage {
  events: AuditEventDTO[];
  nextBefore: string | null;
}
