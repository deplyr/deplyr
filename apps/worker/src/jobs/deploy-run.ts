import type { Job } from "bullmq";
import { and, eq, sql } from "drizzle-orm";
import { db, deploys, deploySteps, projects, servers, secrets, users, decryptSecret, recordAudit, notify } from "@deplyr/db";
import type { DeployRunJob } from "@deplyr/queue";
import {
  DEPLOY_STEP_NAMES,
  resolveBuildPlan,
  type DeployStepName,
} from "@deplyr/shared-types";
import { runAgentCommand } from "../lib/agent-commands";
import { allocatePort } from "../lib/allocate-port";
import { buildPayload, type StepContext } from "../lib/deploy-payloads";

/**
 * Runs the full clone -> install -> write_env -> build -> start -> nginx ->
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

  const audit = (status: "success" | "failure", summary: string, detail?: string) =>
    recordAudit({
      ownerId: project.userId,
      serverId: project.serverId,
      actor: "system",
      action: "deploy.run",
      status,
      summary,
      detail,
      resourceType: "project",
      resourceId: project.id,
      resourceName: project.name,
    });

  const [server] = await db.select().from(servers).where(eq(servers.id, project.serverId));

  // Audit line and channel message for how a deploy ended — same facts, two audiences.
  const report = async (ok: boolean, summary: string, detail?: string) => {
    await audit(ok ? "success" : "failure", summary, detail);
    await notify({
      ownerId: project.userId,
      event: ok ? "deploy.succeeded" : "deploy.failed",
      title: ok ? `Deployed ${project.name}` : summary,
      message: ok ? `${project.name} is live.` : detail ?? "The deploy did not complete.",
      fields: [
        { name: "Project", value: project.name },
        ...(server ? [{ name: "Server", value: server.name }] : []),
        { name: "Branch", value: project.githubBranch },
      ],
      link: `/projects/${project.id}/deploys/${deploy.id}`,
      projectId: project.id,
      projectName: project.name,
      serverId: project.serverId,
      serverName: server?.name ?? null,
    });
  };

  if (!server || server.status !== "connected") {
    await failDeploy(deploy.id, project.id, "server is not connected");
    await report(false, `Deploy of ${project.name} failed`, "The server isn't connected.");
    return;
  }

  const [owner] = await db.select().from(users).where(eq(users.id, project.userId));
  if (!owner) {
    await failDeploy(deploy.id, project.id, "project owner not found");
    return;
  }
  if (!owner.githubAccessToken) {
    await failDeploy(deploy.id, project.id, "project owner has no GitHub account connected");
    await report(false, `Deploy of ${project.name} failed`, "GitHub isn't connected — connect it in Settings.");
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

  const plan = resolveBuildPlan(project.framework, project.settings);
  const appDir = `${process.env.DEPLYR_HOME ?? "/var/lib/deplyr"}/apps/${project.id}`;
  const srcDir = `${appDir}/src`;

  const ctx: StepContext = {
    project,
    plan,
    srcDir,
    workDir: plan.rootDir ? `${srcDir}/${plan.rootDir}` : srcDir,
    // Outside the source tree on purpose — see DeployInstallCommandPayload.
    envFile: `${appDir}/app.env`,
    imageTag: `deplyr-app-${project.subdomain}:latest`,
    containerName: `deplyr-${project.subdomain}`,
    port,
    domain: process.env.DEPLYR_APP_DOMAIN ?? "deplyr.app",
    certPem: process.env.DEPLYR_WILDCARD_CERT_PEM,
    keyPem: process.env.DEPLYR_WILDCARD_KEY_PEM,
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
      await report(false, `Deploy of ${project.name} failed at ${stepName.replace(/_/g, " ")}`, message);
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
  await report(true, `Deployed ${project.name}`);
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
