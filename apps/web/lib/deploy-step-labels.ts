import type { DeployStepName } from "@argo/shared-types";

/** Matches the checklist wording from the product's own UX sketch. */
export const DEPLOY_STEP_LABELS: Record<DeployStepName, string> = {
  clone: "Repository connected",
  install: "Dependencies installed",
  build: "Application built",
  write_env: "Secrets configured",
  start: "Application started",
  nginx: "Domain connected",
  ssl: "SSL enabled",
  health_check: "Health check passed",
};
