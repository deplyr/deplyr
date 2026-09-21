import {
  type BuildPlan,
  type DeployStepName,
  type DeployCloneCommandPayload,
  type DeployInstallCommandPayload,
  type DeployBuildCommandPayload,
  type DeployWriteEnvCommandPayload,
  type DeployStartCommandPayload,
  type DeployNginxCommandPayload,
  type DeploySslCommandPayload,
  type DeployHealthCheckCommandPayload,
} from "@deplyr/shared-types";
import type { projects } from "@deplyr/db";

/** Turns one deploy step + the project's resolved plan into the payload the
 * agent's command handler receives. Kept apart from the job so it can be
 * exercised directly, without a database or a queue. */
export interface StepContext {
  project: typeof projects.$inferSelect;
  plan: BuildPlan;
  srcDir: string;
  /** srcDir, or its rootDir subfolder for monorepos. */
  workDir: string;
  envFile: string;
  imageTag: string;
  containerName: string;
  port: number;
  domain: string;
  certPem: string | undefined;
  keyPem: string | undefined;
  githubToken: string;
  env: Record<string, string>;
}

export function buildPayload(step: DeployStepName, ctx: StepContext): Record<string, unknown> {
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
      const payload: DeployInstallCommandPayload = {
        workDir: ctx.workDir,
        image: ctx.plan.image,
        command: ctx.plan.install,
      };
      return payload as unknown as Record<string, unknown>;
    }
    case "write_env": {
      const payload: DeployWriteEnvCommandPayload = { envFile: ctx.envFile, env: ctx.env };
      return payload as unknown as Record<string, unknown>;
    }
    case "build": {
      const payload: DeployBuildCommandPayload = {
        mode: ctx.plan.mode,
        workDir: ctx.workDir,
        envFile: ctx.envFile,
        image: ctx.plan.image,
        command: ctx.plan.build,
        dockerfile: ctx.plan.dockerfilePath,
        imageTag: ctx.imageTag,
      };
      return payload as unknown as Record<string, unknown>;
    }
    case "start": {
      const payload: DeployStartCommandPayload = {
        mode: ctx.plan.mode,
        workDir: ctx.workDir,
        envFile: ctx.envFile,
        containerName: ctx.containerName,
        port: ctx.port,
        image: ctx.plan.image,
        command: ctx.plan.start,
        imageTag: ctx.imageTag,
        // Production mode unless the user's own variables say otherwise
        // (an explicit -e would override theirs, so only add it when absent).
        extraEnv: ctx.plan.mode === "auto" && !("NODE_ENV" in ctx.env) ? { NODE_ENV: "production" } : {},
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
      const payload: DeployHealthCheckCommandPayload = { port: ctx.port, path: ctx.plan.healthCheckPath };
      return payload as unknown as Record<string, unknown>;
    }
  }
}
