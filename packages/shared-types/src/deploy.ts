import { z } from "zod";

/** Ordered list of steps every Phase 1 deploy runs, agent-side. */
export const DEPLOY_STEP_NAMES = [
  "clone",
  "install",
  "build",
  "write_env",
  "start",
  "nginx",
  "ssl",
  "health_check",
] as const;

export const deployStepNameSchema = z.enum(DEPLOY_STEP_NAMES);
export type DeployStepName = z.infer<typeof deployStepNameSchema>;

export const deployStepStatusSchema = z.enum([
  "pending",
  "running",
  "success",
  "failed",
]);
export type DeployStepStatus = z.infer<typeof deployStepStatusSchema>;

export const deployStatusSchema = z.enum([
  "queued",
  "running",
  "success",
  "failed",
]);
export type DeployStatus = z.infer<typeof deployStatusSchema>;

/** What GET /projects/:id/deploys and GET /deploys/:id return. */
export interface DeployStepSummary {
  name: DeployStepName;
  status: DeployStepStatus;
  log: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface DeploySummary {
  id: string;
  projectId: string;
  status: DeployStatus;
  commitSha: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  steps: DeployStepSummary[];
}
