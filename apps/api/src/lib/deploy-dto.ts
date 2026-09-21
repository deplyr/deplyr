import type { deploys, deploySteps } from "@deplyr/db";

export function toDeploySummary(
  deploy: typeof deploys.$inferSelect,
  steps: (typeof deploySteps.$inferSelect)[],
) {
  return {
    id: deploy.id,
    projectId: deploy.projectId,
    status: deploy.status,
    commitSha: deploy.commitSha,
    startedAt: deploy.startedAt,
    finishedAt: deploy.finishedAt,
    createdAt: deploy.createdAt,
    steps: steps.map((s) => ({
      name: s.name,
      status: s.status,
      log: s.log,
      startedAt: s.startedAt,
      finishedAt: s.finishedAt,
    })),
  };
}
