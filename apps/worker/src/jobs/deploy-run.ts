import type { Job } from "bullmq";
import { and, eq, sql } from "drizzle-orm";
import { db, deploys, deploySteps, projects, servers, secrets, users, decryptSecret } from "@argo/db";
import type { DeployRunJob } from "@argo/queue";
import {
  DEPLOY_STEP_NAMES,
  type DeployStepName,
  type DeployCloneCommandPayload,
  type DeployInstallCommandPayload,
  type DeployBuildCommandPayload,
  type DeployWriteEnvCommandPayload,
  type DeployStartCommandPayload,
  type DeployNginxCommandPayload,
  type DeploySslCommandPayload,
  type DeployHealthCheckCommandPayload,
} from "@argo/shared-types";
import { runAgentCommand } from "../lib/agent-commands";
import { allocatePort } from "../lib/allocate-port";

/**
 * Runs the full clone -> install -> build -> write_env -> start -> nginx ->
 * ssl -> health_check pipeline for one deploy, one step at a time, over the
 * agent-bridge (docs/PHASE1_DESIGN.md section 5.4). Stops at the first
 * failing step — no rollback in Phase 1.
 */
export async function processDeployRun(job: Job<DeployRunJob>) {
  const { deployId } = job.data;

  const [deploy] = await db.select().from(deploys).where(eq(deploys.id, deployId));
  if (!deploy) {
    console.error(`[worker] deploy:run — deploy ${deployId} not found`);
    return;
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, deploy.projectId));
  if (!project) {
    await failDeploy(deploy.id, undefined, "project not found");
    return;
  }

  const [server] = await db.select().from(servers).where(eq(servers.id, project.serverId));
  if (!server || server.status !== "connected") {
    await failDeploy(deploy.id, project.id, "server is not connected");
    return;
  }

  const [owner] = await db.select().from(users).where(eq(users.id, project.userId));
  if (!owner) {
    await failDeploy(deploy.id, project.id, "project owner not found");
    return;
  }
  const githubToken = decryptSecret(owner.githubAccessToken);

  let port = project.appPort;
  if (!port) {
    port = await allocatePort();
    await db
      .update(projects)
      .set({ appPort: port, updatedAt: new Date() })
      .where(eq(projects.id, project.id));
  }

  const secretRows = await db.select().from(secrets).where(eq(secrets.projectId, project.id));
  const env: Record<string, string> = {};
  for (const row of secretRows) {
    const value = decryptSecret(row.value);
    if (value.length > 0) env[row.key] = value;
  }

  const ctx: StepContext = {
    project,
    srcDir: `/var/lib/argo/apps/${project.id}/src`,
    containerName: `argo-${project.subdomain}`,
    port,
    domain: process.env.ARGO_APP_DOMAIN ?? "argo.app",
    certPem: process.env.ARGO_WILDCARD_CERT_PEM,
    keyPem: process.env.ARGO_WILDCARD_KEY_PEM,
    githubToken,
    env,
  };

  await db
    .update(deploys)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(deploys.id, deploy.id));

  for (const stepName of DEPLOY_STEP_NAMES) {
    await db
      .update(deploySteps)
      .set({ status: "running", startedAt: new Date() })
      .where(and(eq(deploySteps.deployId, deploy.id), eq(deploySteps.name, stepName)));

    try {
      await runAgentCommand({
        serverId: server.id,
        name: `deploy.${stepName}`,
        payload: buildPayload(stepName, ctx),
        onLog: (line) => appendStepLog(deploy.id, stepName, line),
      });
      await db
        .update(deploySteps)
        .set({ status: "success", finishedAt: new Date() })
        .where(and(eq(deploySteps.deployId, deploy.id), eq(deploySteps.name, stepName)));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await appendStepLog(deploy.id, stepName, `error: ${message}`);
      await db
        .update(deploySteps)
        .set({ status: "failed", finishedAt: new Date() })
        .where(and(eq(deploySteps.deployId, deploy.id), eq(deploySteps.name, stepName)));
      await db
        .update(deploys)
        .set({ status: "failed", finishedAt: new Date() })
        .where(eq(deploys.id, deploy.id));
      await db
        .update(projects)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(projects.id, project.id));
      return;
    }
  }

  await db
    .update(deploys)
    .set({ status: "success", finishedAt: new Date() })
    .where(eq(deploys.id, deploy.id));
  await db
    .update(projects)
    .set({ status: "live", updatedAt: new Date() })
    .where(eq(projects.id, project.id));
}

async function failDeploy(deployId: string, projectId: string | undefined, reason: string) {
  await db
    .update(deploys)
    .set({ status: "failed", finishedAt: new Date() })
    .where(eq(deploys.id, deployId));
  if (projectId) {
    await db
      .update(projects)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(projects.id, projectId));
  }
  console.error(`[worker] deploy:run ${deployId} failed before starting: ${reason}`);
}

async function appendStepLog(deployId: string, stepName: DeployStepName, line: string) {
  await db
    .update(deploySteps)
    .set({ log: sql`${deploySteps.log} || ${line + "\n"}` })
    .where(and(eq(deploySteps.deployId, deployId), eq(deploySteps.name, stepName)));
}

interface StepContext {
  project: typeof projects.$inferSelect;
  srcDir: string;
  containerName: string;
  port: number;
  domain: string;
  certPem: string | undefined;
  keyPem: string | undefined;
  githubToken: string;
  env: Record<string, string>;
}

function buildPayload(step: DeployStepName, ctx: StepContext): Record<string, unknown> {
  switch (step) {
    case "clone": {
      const payload: DeployCloneCommandPayload = {
        cloneUrl: `https://x-access-token:${ctx.githubToken}@github.com/${ctx.project.githubRepo}.git`,
        branch: ctx.project.githubBranch,
        srcDir: ctx.srcDir,
      };
      return payload as unknown as Record<string, unknown>;
    }
    case "install": {
      const payload: DeployInstallCommandPayload = { srcDir: ctx.srcDir };
      return payload as unknown as Record<string, unknown>;
    }
    case "build": {
      const payload: DeployBuildCommandPayload = { srcDir: ctx.srcDir };
      return payload as unknown as Record<string, unknown>;
    }
    case "write_env": {
      const payload: DeployWriteEnvCommandPayload = { srcDir: ctx.srcDir, env: ctx.env };
      return payload as unknown as Record<string, unknown>;
    }
    case "start": {
      const payload: DeployStartCommandPayload = {
        srcDir: ctx.srcDir,
        containerName: ctx.containerName,
        port: ctx.port,
      };
      return payload as unknown as Record<string, unknown>;
    }
    case "nginx": {
      const payload: DeployNginxCommandPayload = {
        slug: ctx.project.subdomain,
        domain: ctx.domain,
        port: ctx.port,
      };
      return payload as unknown as Record<string, unknown>;
    }
    case "ssl": {
      const payload: DeploySslCommandPayload = {
        slug: ctx.project.subdomain,
        domain: ctx.domain,
        port: ctx.port,
        ...(ctx.certPem && ctx.keyPem ? { certPem: ctx.certPem, keyPem: ctx.keyPem } : {}),
      };
      return payload as unknown as Record<string, unknown>;
    }
    case "health_check": {
      const payload: DeployHealthCheckCommandPayload = { port: ctx.port, path: "/" };
      return payload as unknown as Record<string, unknown>;
    }
  }
}
