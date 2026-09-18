import Link from "next/link";
import { Boxes, Plus } from "lucide-react";
import type { ProjectSummary } from "@argo/shared-types";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { FrameworkBadge } from "@/components/projects/framework-badge";
import { apiFetch } from "@/lib/api";

const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN ?? "argo.app";

async function getProjects(): Promise<ProjectSummary[]> {
  const res = await apiFetch("/projects");
  if (!res.ok) return [];
  return res.json();
}

export default async function ProjectsPage() {
  const projects = await getProjects();

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Projects</h1>
          <p className="mt-1 text-sm text-muted">
            Apps deployed from a GitHub repo.
          </p>
        </div>
        {projects.length > 0 ? (
          <Link href="/projects/new">
            <Button>
              <Plus className="h-4 w-4" strokeWidth={1.75} />
              New project
            </Button>
          </Link>
        ) : null}
      </header>

      {projects.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No projects yet"
          description="Connect a GitHub repo and a server to deploy your first project."
          action={
            <Link href="/projects/new">
              <Button>New project</Button>
            </Link>
          }
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                href={`/projects/${project.id}`}
                className="flex items-center justify-between px-4 py-3.5 transition-colors hover:bg-surface-hover"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {project.name}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-xs text-muted">
                    {project.subdomain}.{APP_DOMAIN}
                  </p>
                </div>
                <FrameworkBadge framework={project.framework} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
