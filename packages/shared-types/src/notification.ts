import { z } from "zod";

export interface HealthSummary {
  isHealthy: boolean | null;
  lastCheckedAt: string | null;
}

// ---------------------------------------------------------------------------
// channels
// ---------------------------------------------------------------------------

export const NOTIFICATION_TYPES = ["slack", "discord"] as const;
export const notificationTypeSchema = z.enum(NOTIFICATION_TYPES);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

export type NotificationLevel = "critical" | "success" | "info";

/** Everything Deplyr can tell you about, and who it's for. */
export const NOTIFICATION_EVENTS = [
  { id: "app.down", group: "Apps", label: "An app goes down", level: "critical" },
  { id: "app.recovered", group: "Apps", label: "An app recovers", level: "success" },
  { id: "deploy.succeeded", group: "Deploys", label: "A deploy succeeds", level: "success" },
  { id: "deploy.failed", group: "Deploys", label: "A deploy fails", level: "critical" },
  { id: "server.offline", group: "Servers", label: "A server goes offline", level: "critical" },
  { id: "server.online", group: "Servers", label: "A server comes back", level: "success" },
  { id: "database.down", group: "Databases", label: "A database stops responding", level: "critical" },
  { id: "database.recovered", group: "Databases", label: "A database recovers", level: "success" },
] as const satisfies ReadonlyArray<{ id: string; group: string; label: string; level: NotificationLevel }>;

export type NotificationEventId = (typeof NOTIFICATION_EVENTS)[number]["id"];
export const NOTIFICATION_EVENT_IDS = NOTIFICATION_EVENTS.map((e) => e.id) as [NotificationEventId, ...NotificationEventId[]];
export const notificationEventSchema = z.enum(NOTIFICATION_EVENT_IDS);

/**
 * Webhook URLs are only accepted for the real Slack / Discord hosts. The
 * server makes an outbound request to whatever URL is stored, so a free-form
 * URL would let anyone make it call internal addresses (SSRF).
 */
const SLACK_URL = /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9]+\/[A-Za-z0-9]+\/[A-Za-z0-9]+$/;
const DISCORD_URL = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9._-]+(?:\?thread_id=\d+)?$/;

export function isValidWebhookUrl(type: NotificationType, url: string): boolean {
  return (type === "slack" ? SLACK_URL : DISCORD_URL).test(url);
}

/** Enough of the URL to recognise a channel by, never enough to use it. */
export function webhookHint(url: string): string {
  return `…${url.replace(/\?.*$/, "").slice(-5)}`;
}

export const createChannelInputSchema = z
  .object({
    type: notificationTypeSchema,
    name: z.string().trim().min(1, "give it a name").max(60),
    webhookUrl: z.string().trim(),
    events: z.array(notificationEventSchema).min(1, "pick at least one event"),
    /** null / omitted = every project. */
    projectId: z.string().uuid().nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (!isValidWebhookUrl(v.type, v.webhookUrl)) {
      ctx.addIssue({
        code: "custom",
        path: ["webhookUrl"],
        message: v.type === "slack" ? "That doesn't look like a Slack incoming-webhook URL (https://hooks.slack.com/services/…)" : "That doesn't look like a Discord webhook URL (https://discord.com/api/webhooks/…)",
      });
    }
  });
export type CreateChannelInput = z.infer<typeof createChannelInputSchema>;

export const updateChannelInputSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  enabled: z.boolean().optional(),
  events: z.array(notificationEventSchema).min(1, "pick at least one event").optional(),
});
export type UpdateChannelInput = z.infer<typeof updateChannelInputSchema>;

/** Never carries the webhook URL — only a hint, same posture as secrets. */
export interface NotificationChannelDTO {
  id: string;
  type: NotificationType;
  name: string;
  hint: string | null;
  enabled: boolean;
  events: NotificationEventId[];
  projectId: string | null;
  projectName: string | null;
  createdAt: string;
  /** The most recent delivery through this channel, if any. */
  lastDelivery: { status: "sent" | "failed"; at: string; error: string | null } | null;
}

// ---------------------------------------------------------------------------
// history
// ---------------------------------------------------------------------------

export type NotificationStatus = "sent" | "failed";

export interface NotificationHistoryDTO {
  id: string;
  channelId: string | null;
  channelName: string;
  channelType: NotificationType;
  /** An event id, or "test". */
  event: string;
  level: NotificationLevel;
  title: string;
  message: string;
  status: NotificationStatus;
  error: string | null;
  attempts: number;
  projectId: string | null;
  projectName: string | null;
  serverId: string | null;
  serverName: string | null;
  createdAt: string;
}

export interface NotificationHistoryPage {
  items: NotificationHistoryDTO[];
  nextBefore: string | null;
}

// ---------------------------------------------------------------------------
// what gets sent
// ---------------------------------------------------------------------------

export interface NotificationMessage {
  level: NotificationLevel;
  title: string;
  message: string;
  fields?: Array<{ name: string; value: string }>;
  /** Deep link back into Deplyr. */
  url?: string;
  /** ISO timestamp; defaults to now. */
  at?: string;
}

const COLORS: Record<NotificationLevel, { hex: string; int: number }> = {
  critical: { hex: "#F87171", int: 0xf87171 },
  success: { hex: "#34D399", int: 0x34d399 },
  info: { hex: "#22D3EE", int: 0x22d3ee },
};

const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1)}…`);

/** Slack treats & < > as control characters in mrkdwn. */
export const escapeSlack = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const LEVEL_EMOJI: Record<NotificationLevel, string> = { critical: "🔴", success: "🟢", info: "🔵" };

/** Discord embed limits: title 256, description 4096, 25 fields, name 256, value 1024. */
export function formatDiscord(n: NotificationMessage) {
  return {
    username: "Deplyr",
    embeds: [
      {
        title: clip(n.title, 256),
        description: clip(n.message, 4096),
        ...(n.url ? { url: n.url } : {}),
        color: COLORS[n.level].int,
        fields: (n.fields ?? []).slice(0, 25).map((f) => ({ name: clip(f.name, 256) || "—", value: clip(f.value, 1024) || "—", inline: true })),
        footer: { text: "Deplyr" },
        timestamp: n.at ?? new Date().toISOString(),
      },
    ],
  };
}

/** Slack section text limit is 3000 characters. */
export function formatSlack(n: NotificationMessage) {
  const blocks: unknown[] = [
    { type: "section", text: { type: "mrkdwn", text: clip(`*${escapeSlack(n.title)}*\n${escapeSlack(n.message)}`, 3000) } },
  ];
  const fields = (n.fields ?? []).slice(0, 10);
  if (fields.length) {
    blocks.push({ type: "section", fields: fields.map((f) => ({ type: "mrkdwn", text: clip(`*${escapeSlack(f.name)}*\n${escapeSlack(f.value)}`, 2000) })) });
  }
  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: n.url ? `<${n.url}|Open in Deplyr> · Deplyr` : "Deplyr" }],
  });
  return {
    // `text` is what shows in notifications and screen readers; the blocks are the rich version.
    // Escaped too: Slack parses this field as mrkdwn as well, so an unescaped
    // title like "<!channel>" would ping the whole workspace.
    text: `${LEVEL_EMOJI[n.level]} ${escapeSlack(n.title)}`,
    attachments: [{ color: COLORS[n.level].hex, blocks }],
  };
}

export function formatForChannel(type: NotificationType, n: NotificationMessage) {
  return type === "slack" ? formatSlack(n) : formatDiscord(n);
}
