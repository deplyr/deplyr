import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { db, projects, servers, alertState, recordAudit, notify } from "@deplyr/db";
import type { HealthCheckJob } from "@deplyr/queue";

const REQUEST_TIMEOUT_MS = 8_000;

/**
 * Repeatable sweep (see packages/queue's scheduleHealthCheckSweep) — one
 * run checks every live project, not one job per project. Plain HTTP
 * from the control plane against the project's public subdomain, the
 * same way an end user would reach it; the deploy pipeline's own
 * health_check step already checks from the agent's side, at deploy time.
 */
export async function processHealthCheck(_job: Job<HealthCheckJob>) {
  const domain = process.env.DEPLYR_APP_DOMAIN ?? "deplyr.app";
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

  // Assume healthy until proven otherwise, so a project's very first
  // failing check still alerts (there's no prior "healthy" reading to
  // compare against, but silently swallowing a first-ever failure would
  // be the wrong default).
  const wasHealthy = existing?.isHealthy ?? true;
  const now = new Date();

  if (!existing) {
    await db.insert(alertState).values({
      projectId: project.id,
      isHealthy: healthy,
      lastCheckedAt: now,
    });
  } else {
    await db
      .update(alertState)
      .set({ isHealthy: healthy, lastCheckedAt: now })
      .where(eq(alertState.id, existing.id));
  }

  const justFailed = wasHealthy && !healthy;
  const justRecovered = !wasHealthy && healthy;

  // Logged whether or not any channel is set up — the log is for people looking
  // at the dashboard, channels are only one way of being told.
  if (justFailed || justRecovered) {
    await recordAudit({
      ownerId: project.userId,
      serverId: project.serverId,
      actor: "system",
      action: "alert.health",
      status: justFailed ? "failure" : "success",
      summary: justFailed ? `${project.name} went down` : `${project.name} recovered`,
      detail: justFailed ? `Health check failed for ${url}` : `${url} is responding again`,
      resourceType: "project",
      resourceId: project.id,
      resourceName: project.name,
    });
  }

  if (!justFailed && !justRecovered) return;

  const [server] = await db.select({ name: servers.name }).from(servers).where(eq(servers.id, project.serverId));
  const outcome = await notify({
    ownerId: project.userId,
    event: justFailed ? "app.down" : "app.recovered",
    title: justFailed ? `${project.name} is down` : `${project.name} is back up`,
    message: justFailed ? `The health check for ${url} failed.` : `${url} is responding again.`,
    fields: [
      { name: "Project", value: project.name },
      ...(server ? [{ name: "Server", value: server.name }] : []),
      { name: "Address", value: url },
    ],
    link: `/projects/${project.id}`,
    projectId: project.id,
    projectName: project.name,
    serverId: project.serverId,
    serverName: server?.name ?? null,
    // A check that flaps every minute shouldn't page anyone every minute.
    dedupeKey: `app:${project.id}:${justFailed ? "down" : "up"}`,
  });
  if (outcome.sent > 0) {
    await db.update(alertState).set({ lastAlertSentAt: now }).where(eq(alertState.projectId, project.id));
  }
}
