import { MessagesSquare, Slack, type LucideIcon } from "lucide-react";
import { NOTIFICATION_EVENTS, type NotificationLevel, type NotificationType } from "@deplyr/shared-types";

export const CHANNEL_META: Record<
  NotificationType,
  { label: string; icon: LucideIcon; tile: string; blurb: string; steps: string[]; placeholder: string }
> = {
  discord: {
    label: "Discord",
    icon: MessagesSquare,
    tile: "bg-[#5865F2]/15 text-[#8B95FF]",
    blurb: "Free, and where most teams already are.",
    steps: [
      "Open your server and click the channel's ⚙ Edit Channel",
      "Go to Integrations → Webhooks → New Webhook",
      "Pick a name and channel, then click Copy Webhook URL",
    ],
    placeholder: "https://discord.com/api/webhooks/…",
  },
  slack: {
    label: "Slack",
    icon: Slack,
    tile: "bg-[#E01E5A]/15 text-[#FF6FA0]",
    blurb: "Post into any Slack channel you choose.",
    steps: [
      "Go to api.slack.com/apps and create an app (or open one)",
      "Turn on Incoming Webhooks, then Add New Webhook to Workspace",
      "Choose the channel and copy the Webhook URL",
    ],
    placeholder: "https://hooks.slack.com/services/…",
  },
};

export const EVENT_LABEL = Object.fromEntries(NOTIFICATION_EVENTS.map((e) => [e.id, e.label])) as Record<string, string>;
export const EVENT_GROUPS = ["Apps", "Deploys", "Servers", "Databases"] as const;

export const LEVEL_STYLE: Record<NotificationLevel, string> = {
  critical: "border-danger/25 bg-danger/10 text-danger",
  success: "border-success/25 bg-success/10 text-success",
  info: "border-border bg-surface-hover text-muted",
};
