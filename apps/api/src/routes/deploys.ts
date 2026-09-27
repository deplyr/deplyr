import { Hono } from "hono";
import { and, asc, eq } from "drizzle-orm";
import { db, deploys, deploySteps, projects, recordAudit } from "@deplyr/db";
import { deployRunQueue } from "@deplyr/queue";
import { requireAuth } from "../lib/require-auth";
import { toDeploySummary } from "../lib/deploy-dto";
import type { AppEnv } from "../types";

export const deploysRoute = new Hono<AppEnv>();
deploysRoute.use("*", requireAuth);

deploysRoute.get("/:id", async (c) => {
  const userId = c.get("userId");
  const [row] = await db
    .select({ deploy: deploys })
    .from(deploys)
    .innerJoin(projects, eq(deploys.projectId, projects.id))
    .where(and(eq(deploys.id, c.req.param("id")), eq(projects.userId, userId)));
  if (!row) return c.json({ error: "not found" }, 404);

  const steps = await db
    .select()
    .from(deploySteps)
    .where(eq(deploySteps.deployId, row.deploy.id))
    .orderBy(asc(deploySteps.orderIndex));

  return c.json(toDeploySummary(row.deploy, steps));
});

// Marks a still-in-flight deploy as cancelled and unblocks the project for a
// fresh deploy. Doesn't reach into the agent to kill a build already
// running there — it just stops Deplyr from waiting on or trusting that
// deploy's outcome. The queue job is removed if the worker hasn't picked it
// up yet; if it's already running, processDeployRun checks this row's
// status before and after every step and bails out instead of overwriting
// what this sets.
deploysRoute.post("/:id/cancel", async (c) => {
  const userId = c.get("userId");
  const [row] = await db
    .select({ deploy: deploys, project: projects })
    .from(deploys)
    .innerJoin(projects, eq(deploys.projectId, projects.id))
    .where(and(eq(deploys.id, c.req.param("id")), eq(projects.userId, userId)));
  if (!row) return c.json({ error: "not found" }, 404);

  const { deploy, project } = row;
  if (deploy.status !== "queued" && deploy.status !== "running") {
    return c.json({ error: "this deploy has already finished" }, 409);
  }

  await db
    .update(deploySteps)
    .set({ status: "cancelled", finishedAt: new Date() })
    .where(and(eq(deploySteps.deployId, deploy.id), eq(deploySteps.status, "running")));

  await db
    .update(deploys)
    .set({ status: "cancelled", finishedAt: new Date() })
    .where(eq(deploys.id, deploy.id));

  await db
    .update(projects)
    .set({ status: "failed", updatedAt: new Date() })
    .where(eq(projects.id, project.id));

  const job = await deployRunQueue().getJob(deploy.id);
  if (job) await job.remove().catch(() => {});

  await recordAudit({
    ownerId: userId,
    serverId: project.serverId,
    action: "deploy.cancel",
    status: "info",
    summary: `Stopped a deploy of ${project.name}`,
    resourceType: "project",
    resourceId: project.id,
    resourceName: project.name,
  });

  const steps = await db
    .select()
    .from(deploySteps)
    .where(eq(deploySteps.deployId, deploy.id))
    .orderBy(asc(deploySteps.orderIndex));

  return c.json(toDeploySummary({ ...deploy, status: "cancelled" }, steps));
});
