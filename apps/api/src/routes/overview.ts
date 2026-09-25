import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { db, projects, servers, deploys, databases, alertState } from "@deplyr/db";
import type {
  ActivityEvent,
  AppHealthRow,
  DatabaseRow,
  OverviewSummary,
} from "@deplyr/shared-types";
import { requireAuth } from "../lib/require-auth";
import type { AppEnv } from "../types";

export const overviewRoute = new Hono<AppEnv>();
overviewRoute.use("*", requireAuth);

const FEED_LIMIT = 12;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

// Read-only rollup for the dashboard. There's no events table — the feed is
// derived from timestamps other tables already carry, so it needs no writes
// from the worker/agent and can't drift out of sync with them.
overviewRoute.get("/", async (c) => {
  const userId = c.get("userId");

  const [projectRows, serverRows, deployRows, dbRows, alertRows] = await Promise.all([
    db.select().from(projects).where(eq(projects.userId, userId)),
    db.select().from(servers).where(eq(servers.userId, userId)),
    db
      .select({ deploy: deploys, project: projects })
      .from(deploys)
      .innerJoin(projects, eq(deploys.projectId, projects.id))
      .where(eq(projects.userId, userId))
      .orderBy(desc(deploys.createdAt))
      .limit(20),
    db
      .select({ database: databases, project: projects })
      .from(databases)
      .innerJoin(servers, eq(databases.serverId, servers.id))
      .leftJoin(projects, eq(databases.projectId, projects.id))
      .where(eq(servers.userId, userId))
      .orderBy(desc(databases.createdAt)),
    db
      .select({ alert: alertState, project: projects })
      .from(alertState)
      .innerJoin(projects, eq(alertState.projectId, projects.id))
      .where(eq(projects.userId, userId)),
  ]);

  const events: ActivityEvent[] = [];

  for (const { deploy, project } of deployRows) {
    const at = deploy.finishedAt ?? deploy.startedAt ?? deploy.createdAt;
    const sha = deploy.commitSha ? deploy.commitSha.slice(0, 7) : null;
    const base = { id: `deploy-${deploy.id}`, kind: "deploy" as const, at: at.toISOString(), href: `/projects/${project.id}` };
    if (deploy.status === "success") {
      events.push({ ...base, tone: "success", title: `Deployed ${project.name}`, detail: sha ? `commit ${sha}` : null });
    } else if (deploy.status === "failed") {
      events.push({ ...base, tone: "danger", title: `Deploy failed — ${project.name}`, detail: sha ? `commit ${sha}` : null });
    } else {
      events.push({ ...base, tone: "warning", title: `Deploying ${project.name}`, detail: deploy.status });
    }
  }

  const dbVerb = {
    running: "is running",
    provisioning: "is provisioning",
    stopped: "is stopped",
    removing: "is being removed",
    error: "failed",
  } as const;
  for (const { database, project } of dbRows) {
    const tone =
      database.status === "running" && database.isUp !== false
        ? "success"
        : database.status === "error" || database.isUp === false
          ? "danger"
          : "warning";
    events.push({
      id: `db-${database.id}`,
      kind: "database",
      tone,
      title: `${database.type === "redis" ? "Redis" : "Postgres"} ${database.name} ${dbVerb[database.status]}`,
      detail: project?.name ?? null,
      at: database.createdAt.toISOString(),
      href: `/servers/${database.serverId}/databases/${database.id}`,
    });
  }

  for (const { alert, project } of alertRows) {
    if (!alert.lastAlertSentAt) continue;
    events.push({
      id: `alert-${alert.id}`,
      kind: "alert",
      tone: alert.isHealthy ? "success" : "danger",
      title: alert.isHealthy ? `${project.name} recovered` : `${project.name} went down`,
      // Not "Slack alert sent" — channels are Slack *or* Discord (and an
      // alert can fan out to several at once), so this can't name one.
      detail: "Notified your channels",
      at: alert.lastAlertSentAt.toISOString(),
      href: `/projects/${project.id}`,
    });
  }

  for (const server of serverRows) {
    if (server.agentConnectedAt) {
      events.push({
        id: `server-${server.id}`,
        kind: "server",
        tone: "success",
        title: `Server ${server.name} connected`,
        detail: server.ipAddress,
        at: server.agentConnectedAt.toISOString(),
        href: `/servers/${server.id}`,
      });
    } else if (server.status === "error") {
      events.push({
        id: `server-${server.id}`,
        kind: "server",
        tone: "danger",
        title: `Server ${server.name} needs attention`,
        detail: server.statusDetail,
        at: server.updatedAt.toISOString(),
        href: `/servers/${server.id}`,
      });
    }
  }

  for (const project of projectRows) {
    events.push({
      id: `project-${project.id}`,
      kind: "project",
      tone: "neutral",
      title: `Project ${project.name} created`,
      detail: project.githubRepo,
      at: project.createdAt.toISOString(),
      href: `/projects/${project.id}`,
    });
  }

  events.sort((a, b) => b.at.localeCompare(a.at));

  const alertByProject = new Map(alertRows.map((r) => [r.project.id, r.alert]));
  const health: AppHealthRow[] = projectRows
    .filter((p) => p.status === "live")
    .map((p) => {
      const state = alertByProject.get(p.id);
      return {
        projectId: p.id,
        name: p.name,
        subdomain: p.subdomain,
        status: state ? (state.isHealthy ? "healthy" : "unhealthy") : "unknown",
        lastCheckedAt: iso(state?.lastCheckedAt),
      };
    });

  const databaseRows: DatabaseRow[] = dbRows.map(({ database, project }) => ({
    id: database.id,
    serverId: database.serverId,
    name: database.name,
    projectId: project?.id ?? null,
    projectName: project?.name ?? null,
    type: database.type,
    status: database.status,
    isUp: database.isUp,
    createdAt: database.createdAt.toISOString(),
  }));

  const body: OverviewSummary = {
    events: events.slice(0, FEED_LIMIT),
    health,
    databases: databaseRows,
  };
  return c.json(body);
});
