import Link from "next/link";
import { GitBranch } from "lucide-react";
import type { ProjectSummary } from "@deplyr/shared-types";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { FrameworkBadge } from "@/components/projects/framework-badge";
import { APP_DOMAIN } from "@/lib/app-domain";

export const projectTone = {
  created: "neutral",
  deploying: "warning",
  live: "success",
  failed: "danger",
} as const;

export function ProjectCard({ project, style }: { project: ProjectSummary; style?: React.CSSProperties }) {
  return (
    <Link href={`/projects/${project.id}`} className="animate-fade-up" style={style}>
      <GlassCard hover innerClassName="flex min-h-[9.5rem] flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 font-mono text-base font-semibold text-accent">
            {project.name.charAt(0).toUpperCase()}
          </span>
          <Badge tone={projectTone[project.status]}>{project.status}</Badge>
        </div>
        <p className="mt-4 truncate text-sm font-semibold">{project.name}</p>
        <p className="mt-0.5 truncate font-mono text-xs text-accent/80">
          {APP_DOMAIN ? `${project.subdomain}.${APP_DOMAIN}` : project.subdomain}
        </p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs text-muted">
          <span className="flex min-w-0 items-center gap-1.5">
            <GitBranch className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
            <span className="truncate">
              {project.githubRepo}@{project.githubBranch}
            </span>
          </span>
          <FrameworkBadge framework={project.framework} />
        </div>
      </GlassCard>
    </Link>
  );
}
