import { Hono } from "hono";
import { and, count, desc, eq, sql, type SQL } from "drizzle-orm";
import {
  db,
  encryptSecret,
  notificationChannels,
  notifications,
  projects,
  recordAudit,
  sendTestNotification,
} from "@deplyr/db";
import {
  createChannelInputSchema,
  isValidWebhookUrl,
  notificationTypeSchema,
  updateChannelInputSchema,
  webhookHint,
  type NotificationChannelDTO,
  type NotificationEventId,
  type NotificationHistoryDTO,
  type NotificationHistoryPage,
  type NotificationLevel,
} from "@deplyr/shared-types";
import { requireAuth } from "../lib/require-auth";
import type { AppEnv } from "../types";

export const notificationsRoute = new Hono<AppEnv>();
notificationsRoute.use("*", requireAuth);

const MAX_CHANNELS = 20;
const HISTORY_MAX = 100;

async function toChannelDTO(row: typeof notificationChannels.$inferSelect, projectName: string | null): Promise<NotificationChannelDTO> {
  const [last] = await db
    .select({ status: notifications.status, at: notifications.createdAt, error: notifications.error })
    .from(notifications)
    .where(eq(notifications.channelId, row.id))
    .orderBy(desc(notifications.createdAt))
    .limit(1);
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    hint: row.hint,
    enabled: row.enabled,
    events: row.events as NotificationEventId[],
    projectId: row.projectId,
    projectName,
    createdAt: row.createdAt.toISOString(),
    lastDelivery: last ? { status: last.status, at: last.at.toISOString(), error: last.error } : null,
  };
}

async function getOwnedChannel(userId: string, id: string) {
  const [row] = await db
    .select({ channel: notificationChannels, projectName: projects.name })
    .from(notificationChannels)
    .leftJoin(projects, eq(notificationChannels.projectId, projects.id))
    .where(and(eq(notificationChannels.id, id), eq(notificationChannels.ownerId, userId)));
  return row ?? null;
}

const audit = (userId: string, action: string, summary: string, name: string, status: "success" | "info" = "success") =>
  recordAudit({ ownerId: userId, action, status, summary, resourceName: name });

// ---------------------------------------------------------------------------
// channels
// ---------------------------------------------------------------------------

notificationsRoute.get("/channels", async (c) => {
  const rows = await db
    .select({ channel: notificationChannels, projectName: projects.name })
    .from(notificationChannels)
    .leftJoin(projects, eq(notificationChannels.projectId, projects.id))
    .where(eq(notificationChannels.ownerId, c.get("userId")))
    .orderBy(notificationChannels.createdAt);
  return c.json(await Promise.all(rows.map((r) => toChannelDTO(r.channel, r.projectName))));
});

notificationsRoute.post("/channels", async (c) => {
  const userId = c.get("userId");
  const parsed = createChannelInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "invalid input", issues: parsed.error.issues }, 400);
  }
  const input = parsed.data;

  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(notificationChannels).where(eq(notificationChannels.ownerId, userId));
  if (n >= MAX_CHANNELS) return c.json({ error: `You can have up to ${MAX_CHANNELS} channels.` }, 409);

  let projectName: string | null = null;
  if (input.projectId) {
    const [project] = await db.select().from(projects).where(and(eq(projects.id, input.projectId), eq(projects.userId, userId)));
    if (!project) return c.json({ error: "project not found" }, 404);
    projectName = project.name;
  }

  const [channel] = await db
    .insert(notificationChannels)
    .values({
      ownerId: userId,
      projectId: input.projectId ?? null,
      type: input.type,
      name: input.name,
      webhookUrl: encryptSecret(input.webhookUrl),
      hint: webhookHint(input.webhookUrl),
      events: input.events,
    })
    .returning();
  if (!channel) return c.json({ error: "failed to create channel" }, 500);

  // Prove it works before keeping it. A channel that silently swallows every
  // alert is worse than no channel — you'd believe you were covered.
  const test = await sendTestNotification(channel.id, userId);
  if (!test.ok) {
    await db.delete(notificationChannels).where(eq(notificationChannels.id, channel.id));
    return c.json({ error: `Couldn't send a test message: ${test.error ?? "unknown error"}` }, 400);
  }

  await audit(userId, "alert.channel.create", `Connected ${input.type === "slack" ? "Slack" : "Discord"} channel ${input.name}`, input.name);
  return c.json(await toChannelDTO(channel, projectName), 201);
});

notificationsRoute.patch("/channels/:id", async (c) => {
  const userId = c.get("userId");
  const found = await getOwnedChannel(userId, c.req.param("id"));
  if (!found) return c.json({ error: "not found" }, 404);

  const parsed = updateChannelInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "invalid input" }, 400);
  const { name, enabled, events, webhookUrl } = parsed.data;

  if (webhookUrl !== undefined && !isValidWebhookUrl(found.channel.type, webhookUrl)) {
    return c.json(
      {
        error:
          found.channel.type === "slack"
            ? "That doesn't look like a Slack incoming-webhook URL (https://hooks.slack.com/services/…)"
            : "That doesn't look like a Discord webhook URL (https://discord.com/api/webhooks/…)",
      },
      400,
    );
  }

  const [updated] = await db
    .update(notificationChannels)
    .set({
      ...(name !== undefined && { name }),
      ...(enabled !== undefined && { enabled }),
      ...(events !== undefined && { events }),
      ...(webhookUrl !== undefined && { webhookUrl: encryptSecret(webhookUrl), hint: webhookHint(webhookUrl) }),
    })
    .where(eq(notificationChannels.id, found.channel.id))
    .returning();
  if (!updated) return c.json({ error: "failed to update" }, 500);

  // Same posture as create: prove a changed webhook still works before
  // keeping it, otherwise revert to what was there before.
  if (webhookUrl !== undefined) {
    const test = await sendTestNotification(updated.id, userId);
    if (!test.ok) {
      await db
        .update(notificationChannels)
        .set({ webhookUrl: found.channel.webhookUrl, hint: found.channel.hint })
        .where(eq(notificationChannels.id, updated.id));
      return c.json({ error: `Couldn't send a test message: ${test.error ?? "unknown error"}` }, 400);
    }
  }

  await audit(
    userId,
    "alert.channel.update",
    enabled === false ? `Paused notifications to ${updated.name}` : enabled === true ? `Resumed notifications to ${updated.name}` : `Updated channel ${updated.name}`,
    updated.name,
    "info",
  );
  return c.json(await toChannelDTO(updated, found.projectName));
});

notificationsRoute.delete("/channels/:id", async (c) => {
  const userId = c.get("userId");
  const found = await getOwnedChannel(userId, c.req.param("id"));
  if (!found) return c.json({ error: "not found" }, 404);
  // History rows stay (their channel_id becomes null; the name is copied in).
  await db.delete(notificationChannels).where(eq(notificationChannels.id, found.channel.id));
  await audit(userId, "alert.channel.delete", `Removed channel ${found.channel.name}`, found.channel.name);
  return c.json({ ok: true });
});

notificationsRoute.post("/channels/:id/test", async (c) => {
  const userId = c.get("userId");
  const found = await getOwnedChannel(userId, c.req.param("id"));
  if (!found) return c.json({ error: "not found" }, 404);
  const result = await sendTestNotification(found.channel.id, userId);
  return c.json({ ok: result.ok, error: result.error }, result.ok ? 200 : 502);
});

// ---------------------------------------------------------------------------
// history
// ---------------------------------------------------------------------------

/** "<iso>|<id>": the id breaks ties between rows created in the same instant. */
function parseCursor(raw: string | undefined) {
  if (!raw) return null;
  const [at, id] = raw.split("|");
  return at && id && !Number.isNaN(Date.parse(at)) && /^[0-9a-f-]{36}$/i.test(id) ? { at, id } : null;
}

notificationsRoute.get("/history", async (c) => {
  const userId = c.get("userId");
  const limit = Math.min(Math.max(Number(c.req.query("limit")) || 25, 1), HISTORY_MAX);
  const cursor = parseCursor(c.req.query("before"));

  const conditions: SQL[] = [eq(notifications.ownerId, userId)];
  const channelId = c.req.query("channelId");
  if (channelId && /^[0-9a-f-]{36}$/i.test(channelId)) conditions.push(eq(notifications.channelId, channelId));
  const status = c.req.query("status");
  if (status === "sent" || status === "failed") conditions.push(eq(notifications.status, status));
  const type = notificationTypeSchema.safeParse(c.req.query("type"));
  if (type.success) conditions.push(eq(notifications.channelType, type.data));
  if (cursor) conditions.push(sql`(${notifications.createdAt}, ${notifications.id}) < (${cursor.at}::timestamptz, ${cursor.id}::uuid)`);

  const rows = await db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const items: NotificationHistoryDTO[] = page.map((n) => ({
    id: n.id,
    channelId: n.channelId,
    channelName: n.channelName,
    channelType: n.channelType,
    event: n.event,
    level: (["critical", "success", "info"].includes(n.level) ? n.level : "info") as NotificationLevel,
    title: n.title,
    message: n.message,
    status: n.status,
    error: n.error,
    attempts: n.attempts,
    projectId: n.projectId,
    projectName: n.projectName,
    serverId: n.serverId,
    serverName: n.serverName,
    createdAt: n.createdAt.toISOString(),
  }));

  const body: NotificationHistoryPage = {
    items,
    nextBefore: rows.length > limit && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
  };
  return c.json(body);
});
