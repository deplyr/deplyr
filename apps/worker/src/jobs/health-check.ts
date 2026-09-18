import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { db, projects, notificationChannels, alertState, decryptSecret } from "@argo/db";
import type { HealthCheckJob } from "@argo/queue";
import { sendSlackMessage } from "../lib/send-slack-alert";

const REQUEST_TIMEOUT_MS = 8_000;

/**
 * Repeatable sweep (see packages/queue's scheduleHealthCheckSweep) — one
 * run checks every live project, not one job per project. Plain HTTP
 * from the control plane against the project's public subdomain, the
 * same way an end user would reach it; the deploy pipeline's own
 * health_check step already checks from the agent's side, at deploy time.
 */
export async function processHealthCheck(_job: Job<HealthCheckJob>) {
  const domain = process.env.ARGO_APP_DOMAIN ?? "argo.app";
  const liveProjects = await db.select().from(projects).where(eq(projects.status, "live"));

  for (const project of liveProjects) {
    await checkProject(project, domain);
  }
}

async function checkProject(project: typeof projects.$inferSelect, domain: string) {
  const url = `http://${project.subdomain}.${domain}/`;

  let healthy: boolean;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    healthy = res.ok;
  } catch {
    healthy = false;
  }

  const [existing] = await db
    .select()
    .from(alertState)
    .where(eq(alertState.projectId, project.id));
  const [channel] = await db
    .select()
    .from(notificationChannels)
    .where(eq(notificationChannels.projectId, project.id));

  // Assume healthy until proven otherwise, so a project's very first
  // failing check still alerts (there's no prior "healthy" reading to
  // compare against, but silently swallowing a first-ever failure would
  // be the wrong default).
  const wasHealthy = existing?.isHealthy ?? true;
  const now = new Date();

  if (!existing) {
    await db.insert(alertState).values({
      projectId: project.id,
      channelId: channel?.id ?? null,
      isHealthy: healthy,
      lastCheckedAt: now,
    });
  } else {
    await db
      .update(alertState)
      .set({ isHealthy: healthy, lastCheckedAt: now, channelId: channel?.id ?? null })
      .where(eq(alertState.id, existing.id));
  }

  const justFailed = wasHealthy && !healthy;
  const justRecovered = !wasHealthy && healthy;
  if (!channel || (!justFailed && !justRecovered)) return;

  const message = justFailed
    ? `🔴 *${project.name}* failed its health check (${url}).`
    : `🟢 *${project.name}* is healthy again (${url}).`;

  try {
    await sendSlackMessage(decryptSecret(channel.webhookUrl), message);
    await db
      .update(alertState)
      .set({ lastAlertSentAt: now })
      .where(eq(alertState.projectId, project.id));
  } catch (err) {
    console.error(`[worker] failed to send Slack alert for project ${project.id}`, err);
  }
}
