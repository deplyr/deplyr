import Link from "next/link";
import { Boxes, Plus, Rocket } from "lucide-react";
import type { ProjectSummary } from "@deplyr/shared-types";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClass } from "@/components/ui/button";
import { Page, PageHeader } from "@/components/ui/page";
import { ProjectCard } from "@/components/projects/project-card";
import { apiFetch } from "@/lib/api";

async function getProjects(): Promise<ProjectSummary[]> {
  const res = await apiFetch("/projects");
  if (!res.ok) return [];
  return res.json();
}

export default async function ProjectsPage() {
  const projects = await getProjects();
  const live = projects.filter((p) => p.status === "live").length;

  return (
    <Page>
      <PageHeader
        eyebrow="Projects"
        title="Your apps"
        description={
          projects.length
            ? `${projects.length} ${projects.length === 1 ? "project" : "projects"} · ${live} live`
            : "Apps deployed straight from a GitHub repo."
        }
        actions={
          projects.length > 0 ? (
            <Link href="/projects/new" className={buttonClass("primary")}>
              <Plus className="h-4 w-4" strokeWidth={2} />
              New project
            </Link>
          ) : null
        }
      />

      {projects.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No projects yet"
          description="Connect a GitHub repo and a server to deploy your first project."
          action={
            <Link href="/projects/new" className={buttonClass("primary")}>
              <Rocket className="h-4 w-4" strokeWidth={1.75} />
              Create your first project
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p, i) => (
            <ProjectCard key={p.id} project={p} style={{ animationDelay: `${i * 60}ms` }} />
          ))}
          <Link
            href="/projects/new"
            className="group flex min-h-[9.5rem] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/15 text-muted transition hover:border-accent/50 hover:bg-accent/[0.04] hover:text-accent"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-current/30 transition group-hover:scale-110">
              <Plus className="h-4 w-4" strokeWidth={1.75} />
            </span>
            <span className="text-sm font-medium">New project</span>
          </Link>
        </div>
      )}
    </Page>
  );
}
