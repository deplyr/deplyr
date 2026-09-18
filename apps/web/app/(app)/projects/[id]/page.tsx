import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import type {
  ProjectSummary,
  SecretSummary,
  DeploySummary,
  DatabaseSummary,
} from "@argo/shared-types";
import { FrameworkBadge } from "@/components/projects/framework-badge";
import { DeployButton } from "@/components/deploys/deploy-button";
import { DeployStatusBadge } from "@/components/deploys/deploy-status-badge";
import { DatabaseCard } from "@/components/databases/database-card";
import { apiFetch } from "@/lib/api";

const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN ?? "argo.app";

async function getProject(id: string): Promise<ProjectSummary | null> {
  const res = await apiFetch(`/projects/${id}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("failed to load project");
  return res.json();
}

async function getSecrets(id: string): Promise<SecretSummary[]> {
  const res = await apiFetch(`/projects/${id}/secrets`);
  if (!res.ok) return [];
  return res.json();
}

async function getDeploys(id: string): Promise<DeploySummary[]> {
  const res = await apiFetch(`/projects/${id}/deploys`);
  if (!res.ok) return [];
  return res.json();
}

async function getDatabase(id: string): Promise<DatabaseSummary | null> {
  const res = await apiFetch(`/projects/${id}/databases`);
  if (!res.ok) return null;
  const rows: DatabaseSummary[] = await res.json();
  return rows[0] ?? null;
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  const [secrets, deploys, database] = await Promise.all([
    getSecrets(id),
    getDeploys(id),
    getDatabase(id),
  ]);
  const setCount = secrets.filter((s) => s.hasValue).length;

  return (
    <div className="mx-auto max-w-lg px-8 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">{project.name}</h1>
          <p className="mt-1 font-mono text-sm text-muted">
            {project.subdomain}.{APP_DOMAIN}
          </p>
        </div>
        <FrameworkBadge framework={project.framework} />
      </header>

      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-surface/40 p-5">
          <p className="text-xs uppercase tracking-wide text-muted">Repository</p>
          <p className="mt-1 font-mono text-sm text-foreground">
            {project.githubRepo}@{project.githubBranch}
          </p>
        </div>

        <Link
          href={`/projects/${id}/secrets`}
          className="flex items-center justify-between rounded-lg border border-border bg-surface/40 p-5 transition-colors hover:bg-surface-hover"
        >
          <div>
            <p className="text-sm font-medium text-foreground">Secrets</p>
            <p className="mt-0.5 text-sm text-muted">
              {secrets.length === 0
                ? "None detected in .env.example"
                : `${setCount} of ${secrets.length} set`}
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted" strokeWidth={1.75} />
        </Link>

        {project.framework ? (
          <DatabaseCard projectId={id} initial={database} />
        ) : null}

        {project.framework ? (
          <div className="rounded-lg border border-border bg-surface/40 p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Deploy</p>
              <DeployButton
                projectId={id}
                disabled={project.status === "deploying"}
                disabledReason={
                  project.status === "deploying"
                    ? "A deploy is already in progress."
                    : undefined
                }
              />
            </div>

            {deploys.length > 0 ? (
              <ul className="mt-4 divide-y divide-border border-t border-border">
                {deploys.map((deploy) => (
                  <li key={deploy.id}>
                    <Link
                      href={`/projects/${id}/deploys/${deploy.id}`}
                      className="flex items-center justify-between py-2.5 text-sm transition-colors hover:text-foreground"
                    >
                      <span className="text-muted">
                        {new Date(deploy.createdAt).toLocaleString()}
                      </span>
                      <DeployStatusBadge status={deploy.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted">No deploys yet.</p>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-danger/30 bg-danger/5 p-5">
            <p className="text-sm text-foreground">
              Argo couldn&apos;t detect a supported framework in this repo.
              Phase 1 only supports Next.js and plain Node projects with a
              package.json that has <code className="font-mono">build</code>{" "}
              and <code className="font-mono">start</code> scripts.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
