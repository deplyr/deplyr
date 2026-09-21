import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { db, auditEvents, servers } from "@deplyr/db";
import { AUDIT_CATEGORIES, type AuditEventDTO, type AuditPage } from "@deplyr/shared-types";

const MAX_LIMIT = 100;

export function parseCategory(raw: string | undefined): string | null {
  return raw && (AUDIT_CATEGORIES as readonly string[]).includes(raw) ? raw : null;
}

/** "<iso>|<id>" — id breaks ties between events with the same timestamp, so
 * paging can neither skip nor repeat rows (a backfill or a burst of actions
 * produces plenty of identical timestamps). */
function parseCursor(raw: string | undefined): { at: string; id: string } | null {
  if (!raw) return null;
  const [at, id] = raw.split("|");
  return at && id && !Number.isNaN(Date.parse(at)) && /^[0-9a-f-]{36}$/i.test(id) ? { at, id } : null;
}

export async function listAudit(params: {
  ownerId: string;
  serverId?: string;
  /** Only events about this resource (a project, database or server id). */
  resourceId?: string;
  category?: string | null;
  limit?: number;
  before?: string;
}): Promise<AuditPage> {
  const limit = Math.min(Math.max(params.limit ?? 30, 1), MAX_LIMIT);
  const cursor = parseCursor(params.before);

  const conditions: SQL[] = [eq(auditEvents.ownerId, params.ownerId)];
  if (params.serverId) conditions.push(eq(auditEvents.serverId, params.serverId));
  if (params.resourceId) conditions.push(eq(auditEvents.resourceId, params.resourceId));
  if (params.category) conditions.push(sql`${auditEvents.action} like ${params.category + ".%"}`);
  if (cursor) {
    conditions.push(sql`(${auditEvents.createdAt}, ${auditEvents.id}) < (${cursor.at}::timestamptz, ${cursor.id}::uuid)`);
  }

  // One extra row tells us whether another page exists without a count query.
  const rows = await db
    .select({ event: auditEvents, serverName: servers.name })
    .from(auditEvents)
    .leftJoin(servers, eq(auditEvents.serverId, servers.id))
    .where(and(...conditions))
    .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const last = page[page.length - 1]?.event;

  const events: AuditEventDTO[] = page.map(({ event: e, serverName }) => ({
    id: e.id,
    action: e.action,
    category: e.action.split(".")[0] ?? e.action,
    status: e.status,
    actor: e.actor,
    summary: e.summary,
    detail: e.detail,
    serverId: e.serverId,
    serverName,
    resourceType: e.resourceType,
    resourceId: e.resourceId,
    resourceName: e.resourceName,
    createdAt: e.createdAt.toISOString(),
  }));

  return {
    events,
    nextBefore: rows.length > limit && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
  };
}
