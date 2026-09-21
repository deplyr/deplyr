"use client";

import Link from "next/link";
import { ChevronRight, History } from "lucide-react";
import { DeployStatusBadge } from "@/components/deploys/deploy-status-badge";
import { deployDuration, stripTone } from "@/components/projects/deploy-utils";
import { useProject } from "@/components/projects/project-context";
import { GlassCard } from "@/components/ui/glass-card";
import { SectionTitle } from "@/components/ui/section-title";
import { timeAgo } from "@/lib/time-ago";
import { cn } from "@/lib/cn";

export default function ProjectDeployments() {
  const { project, deploys } = useProject();
  const base = `/projects/${project.id}`;
  const ok = deploys.filter((d) => d.status === "success").length;

  return (
    <GlassCard className="animate-fade-up" innerClassName="p-6">
      <SectionTitle icon={History} meta={deploys.length ? `${ok} of ${deploys.length} succeeded` : undefined}>
        Deployments
      </SectionTitle>

      {deploys.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm font-medium">No deployments yet</p>
          <p className="mt-1 text-xs text-muted">{project.framework ? "Hit Deploy to ship your first version." : "Fix the build settings first, then deploy."}</p>
        </div>
      ) : (
        <>
          <div className="mb-5 flex gap-1" aria-hidden>
            {[...deploys].slice(0, 40).reverse().map((d) => (
              <span key={d.id} className={cn("h-6 flex-1 rounded-sm", stripTone[d.status])} />
            ))}
          </div>
          <ul className="divide-y divide-white/[0.06]">
            {deploys.map((d) => (
              <li key={d.id}>
                <Link href={`${base}/deploys/${d.id}`} className="group -mx-2 flex items-center gap-4 rounded-xl px-2 py-3.5 transition hover:bg-white/[0.03]">
                  <DeployStatusBadge status={d.status} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-sm">{d.commitSha ? d.commitSha.slice(0, 7) : "—"}</p>
                    <p className="text-xs text-muted">{new Date(d.createdAt).toLocaleString()} · {timeAgo(d.createdAt)}</p>
                  </div>
                  {deployDuration(d) ? <span className="font-mono text-xs text-muted">{deployDuration(d)}</span> : null}
                  <ChevronRight className="h-4 w-4 text-muted transition group-hover:translate-x-0.5" strokeWidth={1.75} />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </GlassCard>
  );
}
