import { Hono } from "hono";
import { and, asc, eq } from "drizzle-orm";
import { db, deploys, deploySteps, projects } from "@argo/db";
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
