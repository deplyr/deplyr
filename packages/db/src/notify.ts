import { and, eq, gte, isNull, or, sql } from "drizzle-orm";
import {
  NOTIFICATION_EVENTS,
  formatForChannel,
  isValidWebhookUrl,
  type NotificationEventId,
  type NotificationLevel,
  type NotificationMessage,
  type NotificationType,
} from "@deplyr/shared-types";
import { db } from "./client";
import { decryptSecret } from "./crypto";
import { notificationChannels, notifications } from "./schema";

const TIMEOUT_MS = 8_000;
const RETRY_DELAY_MS = 1_500;
const MAX_RATE_LIMIT_WAIT_MS = 5_000;
const DEFAULT_COOLDOWN_MS = 2 * 60_000;

export interface DeliveryResult {
  ok: boolean;
  /** Safe to show and store: never contains the webhook URL. */
  error: string | null;
  attempts: number;
}

export interface DeliveryDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
}

/** What the service said, in words a person can act on. */
function explain(status: number, body: string): string {
  // Whatever the service said is shown to the user, so scrub anything that
  // looks like a URL first — a webhook URL carries its own secret token.
  const snippet = body.trim().replace(/https?:\/\/\S+/gi, "[url]").replace(/\s+/g, " ").slice(0, 120);
  if (status === 404 || /no_service|channel_not_found|channel_is_archived|Unknown Webhook/i.test(body)) {
    return "The webhook no longer exists — it may have been deleted. Create a new one and reconnect.";
  }
  if (status === 401 || status === 403 || /invalid_token|Invalid Webhook Token/i.test(body)) {
    return "The webhook was revoked or the token is wrong. Create a new one and reconnect.";
  }
  if (status === 400) return `The message was rejected as malformed${snippet ? `: ${snippet}` : ""}.`;
  if (status >= 300 && status < 400) return "The webhook URL redirected somewhere else, which Deplyr won't follow.";
  return `The service answered HTTP ${status}${snippet ? `: ${snippet}` : ""}.`;
}

/**
 * POST one message to a webhook. Retries once on a network failure, a 5xx, or
 * a 429 (waiting as long as the service asks, up to a cap). It does NOT retry
 * a 4xx — a deleted or revoked webhook won't heal itself — and it never follows
 * redirects: the URL is user-supplied, and a redirect could point the server at
 * an internal address.
 */
export async function deliverWebhook(
  type: NotificationType,
  url: string,
  message: NotificationMessage,
  deps: DeliveryDeps = {},
): Promise<DeliveryResult> {
  const doFetch = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const body = JSON.stringify(formatForChannel(type, message));

  let lastError = "Couldn't reach the service.";
  for (let attempt = 1; attempt <= 2; attempt++) {
    let res: Response;
    try {
      res = await doFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(deps.timeoutMs ?? TIMEOUT_MS),
      });
    } catch (err) {
      lastError = err instanceof Error && err.name === "TimeoutError" ? "The service didn't answer in time." : "Couldn't reach the service.";
      if (attempt < 2) await sleep(RETRY_DELAY_MS);
      continue;
    }

    if (res.ok) return { ok: true, error: null, attempts: attempt };

    const text = await res.text().catch(() => "");
    if (res.status === 429) {
      lastError = "The service is rate-limiting this webhook.";
      if (attempt < 2) {
        const header = Number(res.headers.get("retry-after"));
        let seconds = Number.isFinite(header) && header > 0 ? header : NaN;
        if (Number.isNaN(seconds)) {
          try {
            seconds = Number((JSON.parse(text) as { retry_after?: number }).retry_after);
          } catch {
            /* not JSON */
          }
        }
        await sleep(Math.min(Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : RETRY_DELAY_MS, MAX_RATE_LIMIT_WAIT_MS));
      }
      continue;
    }
    if (res.status >= 500) {
      lastError = explain(res.status, text);
      if (attempt < 2) await sleep(RETRY_DELAY_MS);
      continue;
    }
    return { ok: false, error: explain(res.status, text), attempts: attempt };
  }
  return { ok: false, error: lastError, attempts: 2 };
}

// ---------------------------------------------------------------------------

export interface NotifyInput {
  ownerId: string;
  event: NotificationEventId;
  title: string;
  message: string;
  fields?: Array<{ name: string; value: string }>;
  /** Path inside Deplyr (e.g. "/projects/…"); turned into a full link when WEB_URL is set. */
  link?: string;
  projectId?: string | null;
  projectName?: string | null;
  serverId?: string | null;
  serverName?: string | null;
  /** Identifies "the same thing happening again" — repeats within the cooldown are dropped. */
  dedupeKey?: string;
  cooldownMs?: number;
}

const LEVELS = new Map<string, NotificationLevel>(NOTIFICATION_EVENTS.map((e) => [e.id, e.level]));

function toMessage(input: Pick<NotifyInput, "title" | "message" | "fields" | "link">, level: NotificationLevel): NotificationMessage {
  const base = process.env.WEB_URL?.replace(/\/$/, "");
  return {
    level,
    title: input.title,
    message: input.message,
    fields: input.fields,
    ...(base && input.link ? { url: `${base}${input.link}` } : {}),
  };
}

async function record(row: typeof notifications.$inferInsert) {
  try {
    await db.insert(notifications).values(row);
  } catch (err) {
    console.error("[notify] failed to record history", err);
  }
}

/**
 * Tell every interested channel about something that happened, and write down
 * what happened to each attempt. Never throws — an alert that can't be sent
 * must not break the deploy, health check or agent connection that raised it.
 */
export async function notify(
  input: NotifyInput,
  deps: { deliver?: typeof deliverWebhook } = {},
): Promise<{ sent: number; failed: number; skipped: number }> {
  const result = { sent: 0, failed: 0, skipped: 0 };
  try {
    const deliver = deps.deliver ?? deliverWebhook;
    const level = LEVELS.get(input.event) ?? "info";

    const channels = await db
      .select()
      .from(notificationChannels)
      .where(
        and(
          eq(notificationChannels.ownerId, input.ownerId),
          eq(notificationChannels.enabled, true),
          sql`${notificationChannels.events} @> ${JSON.stringify([input.event])}::jsonb`,
          // A channel scoped to one project only hears about that project.
          input.projectId ? or(isNull(notificationChannels.projectId), eq(notificationChannels.projectId, input.projectId)) : isNull(notificationChannels.projectId),
        ),
      );

    const cooldown = input.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    await Promise.all(
      channels.map(async (channel) => {
        if (input.dedupeKey) {
          const [recent] = await db
            .select({ id: notifications.id })
            .from(notifications)
            .where(
              and(
                eq(notifications.channelId, channel.id),
                eq(notifications.dedupeKey, input.dedupeKey),
                eq(notifications.status, "sent"),
                gte(notifications.createdAt, new Date(Date.now() - cooldown)),
              ),
            )
            .limit(1);
          if (recent) {
            result.skipped++;
            return;
          }
        }

        const base = {
          ownerId: input.ownerId,
          channelId: channel.id,
          channelName: channel.name,
          channelType: channel.type,
          event: input.event,
          level,
          title: input.title,
          message: input.message,
          dedupeKey: input.dedupeKey ?? null,
          projectId: input.projectId ?? null,
          projectName: input.projectName ?? null,
          serverId: input.serverId ?? null,
          serverName: input.serverName ?? null,
        };

        let url: string;
        try {
          url = decryptSecret(channel.webhookUrl);
        } catch {
          result.failed++;
          await record({ ...base, status: "failed", error: "Couldn't read the stored webhook — reconnect this channel.", attempts: 0 });
          return;
        }
        // Checked again at send time, not just when the channel was saved.
        if (!isValidWebhookUrl(channel.type, url)) {
          result.failed++;
          await record({ ...base, status: "failed", error: "The stored webhook isn't a valid Slack/Discord URL — reconnect this channel.", attempts: 0 });
          return;
        }

        const delivery = await deliver(channel.type, url, toMessage(input, level));
        delivery.ok ? result.sent++ : result.failed++;
        await record({ ...base, status: delivery.ok ? "sent" : "failed", error: delivery.error, attempts: delivery.attempts });
      }),
    );
  } catch (err) {
    console.error(`[notify] "${input.event}" failed`, err);
  }
  return result;
}

/** A message that proves a channel works — also recorded in the history. */
export async function sendTestNotification(
  channelId: string,
  ownerId: string,
  deps: { deliver?: typeof deliverWebhook } = {},
): Promise<(DeliveryResult & { found: boolean })> {
  const [channel] = await db
    .select()
    .from(notificationChannels)
    .where(and(eq(notificationChannels.id, channelId), eq(notificationChannels.ownerId, ownerId)));
  if (!channel) return { found: false, ok: false, error: "Channel not found.", attempts: 0 };

  const title = "Test notification from Deplyr";
  const message = `If you can read this, "${channel.name}" is connected and alerts will reach it.`;
  let delivery: DeliveryResult;
  try {
    const url = decryptSecret(channel.webhookUrl);
    delivery = isValidWebhookUrl(channel.type, url)
      ? await (deps.deliver ?? deliverWebhook)(channel.type, url, toMessage({ title, message, link: "/notifications" }, "info"))
      : { ok: false, error: "The stored webhook isn't a valid Slack/Discord URL.", attempts: 0 };
  } catch {
    delivery = { ok: false, error: "Couldn't read the stored webhook.", attempts: 0 };
  }

  await record({
    ownerId,
    channelId: channel.id,
    channelName: channel.name,
    channelType: channel.type,
    event: "test",
    level: "info",
    title,
    message,
    status: delivery.ok ? "sent" : "failed",
    error: delivery.error,
    attempts: delivery.attempts,
  });
  return { ...delivery, found: true };
}
