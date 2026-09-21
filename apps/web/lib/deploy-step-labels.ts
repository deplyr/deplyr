import type { DeployStepName } from "@deplyr/shared-types";

/** Matches the checklist wording from the product's own UX sketch. */
export const DEPLOY_STEP_LABELS: Record<DeployStepName, string> = {
  clone: "Repository connected",
  install: "Dependencies installed",
  write_env: "Secrets configured",
  build: "Application built",
  start: "Application started",
  nginx: "Domain connected",
  ssl: "SSL enabled",
  health_check: "Health check passed",
};
