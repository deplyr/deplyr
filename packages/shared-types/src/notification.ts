import { z } from "zod";

export const setChannelInputSchema = z.object({
  webhookUrl: z.string().url().startsWith("https://hooks.slack.com/"),
});
export type SetChannelInput = z.infer<typeof setChannelInputSchema>;

/** Never carries the webhook URL back out — same reveal posture as secrets. */
export interface NotificationChannelSummary {
  configured: boolean;
}

export interface HealthSummary {
  isHealthy: boolean | null;
  lastCheckedAt: string | null;
}
