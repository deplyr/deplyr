import { notFound } from "next/navigation";
import type { ProjectSummary } from "@argo/shared-types";
import { FrameworkBadge } from "@/components/projects/framework-badge";
import { apiFetch } from "@/lib/api";

const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN ?? "argo.app";

async function getProject(id: string): Promise<ProjectSummary | null> {
  const res = await apiFetch(`/projects/${id}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("failed to load project");
  return res.json();
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

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

        {project.framework ? (
          <div className="rounded-lg border border-border bg-surface/40 p-5">
            <p className="text-sm text-foreground">
              Argo detected a {project.framework === "nextjs" ? "Next.js" : "Node"}{" "}
              app. Deploys aren&apos;t wired up yet — that&apos;s next.
            </p>
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
