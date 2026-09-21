import { db } from "./client";
import { auditEvents } from "./schema";

export interface AuditInput {
  ownerId: string;
  serverId?: string | null;
  actor?: "user" | "system" | "agent";
  /** "<category>.<verb>" — see the categories the UI filters on. */
  action: string;
  status?: "success" | "failure" | "info";
  summary: string;
  detail?: string | null;
  resourceType?: "server" | "database" | "project" | "deploy" | "secret" | null;
  resourceId?: string | null;
  resourceName?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
}

/**
 * Append one line to the audit log. Deliberately swallows its own failures:
 * the log describes an action, it must never be the reason that action fails
 * (or that a worker job retries and does the real work twice).
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await db.insert(auditEvents).values({
      ownerId: input.ownerId,
      serverId: input.serverId ?? null,
      actor: input.actor ?? "user",
      action: input.action,
      status: input.status ?? "info",
      summary: input.summary,
      detail: input.detail ? input.detail.slice(0, 1000) : null,
      resourceType: input.resourceType ?? null,
      resourceId: input.resourceId ?? null,
      resourceName: input.resourceName ?? null,
      metadata: input.metadata ?? null,
    });
  } catch (err) {
    console.error(`[audit] failed to record "${input.action}"`, err);
  }
}
