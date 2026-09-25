"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Boxes, Plus } from "lucide-react";
import type { AppHealthRow, DeploySummary, OverviewSummary, ProjectSummary } from "@deplyr/shared-types";
import { projectTone } from "@/components/projects/project-card";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { SectionTitle } from "@/components/ui/section-title";
import { projectAddress } from "@/lib/app-domain";
import { timeAgo } from "@/lib/time-ago";
import { cn } from "@/lib/cn";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const fetchJson = async <T,>(path: string, fallback: T): Promise<T> => {
  try {
    const res = await fetch(`${API_URL}${path}`, { credentials: "include" });
    return res.ok ? ((await res.json()) as T) : fallback;
  } catch {
    return fallback;
  }
};

interface Row {
  project: ProjectSummary;
  lastDeploy: DeploySummary | null;
  health: AppHealthRow | undefined;
}

export function ServerProjects({ serverId, serverIp, online }: { serverId: string; serverIp: string; online: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [projects, ov] = await Promise.all([
        fetchJson<ProjectSummary[]>("/projects", []),
        fetchJson<OverviewSummary | null>("/overview", null),
      ]);
      const mine = projects.filter((p) => p.serverId === serverId);
      const deploys = await Promise.all(mine.map((p) => fetchJson<DeploySummary[]>(`/projects/${p.id}/deploys`, [])));
      if (cancelled) return;
      setRows(mine.map((project, i) => ({ project, lastDeploy: deploys[i]?.[0] ?? null, health: ov?.health.find((h) => h.projectId === project.id) })));
    })();
    return () => {
      cancelled = true;
    };
  }, [serverId]);

  return (
    <GlassCard className="animate-fade-up" innerClassName="p-6">
      <SectionTitle icon={Boxes} meta={rows?.length ? `${rows.length} total` : undefined}>
        Projects on this server
      </SectionTitle>

      {rows === null ? (
        <div className="h-14 animate-pulse rounded-xl bg-white/[0.04]" />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center py-10 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Boxes className="h-5 w-5" strokeWidth={1.5} />
          </span>
          <p className="mt-3 text-sm font-medium">Nothing deployed here yet</p>
          <p className="mt-1 max-w-xs text-xs text-muted">
            {online ? "Pick a repo and Deplyr will deploy it to this server." : "Once the server is connected, you can deploy to it."}
          </p>
          {online ? (
            <Link href={`/projects/new?server=${serverId}`} className={cn(buttonClass("secondary"), "mt-4")}>
              <Plus className="h-4 w-4" strokeWidth={2} />
              New project
            </Link>
          ) : null}
        </div>
      ) : (
        <>
          <ul className="divide-y divide-white/[0.06]">
            {rows.map(({ project: p, lastDeploy, health }) => (
              <li key={p.id}>
                <Link href={`/projects/${p.id}`} className="group -mx-2 flex items-center gap-4 rounded-xl px-2 py-3.5 transition hover:bg-white/[0.03]">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 font-mono text-sm font-semibold text-accent">
                    {p.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{p.name}</p>
                    <p className="truncate font-mono text-xs text-accent/80">
                      {projectAddress(p.subdomain, serverIp) ?? p.subdomain}
                    </p>
                  </div>
                  <div className="hidden min-w-0 text-right sm:block">
                    {lastDeploy ? (
                      <>
                        <p className="flex items-center justify-end gap-1.5 text-xs">
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              lastDeploy.status === "success" && "bg-success",
                              lastDeploy.status === "failed" && "bg-danger",
                              lastDeploy.status === "running" && "animate-pulse bg-warning",
                              lastDeploy.status === "queued" && "bg-muted",
                            )}
                          />
                          <span className="text-muted">
                            {lastDeploy.status === "success" ? "Deployed" : lastDeploy.status === "failed" ? "Deploy failed" : `Deploy ${lastDeploy.status}`}
                          </span>
                        </p>
                        <p className="mt-1 font-mono text-[11px] text-muted">
                          {lastDeploy.commitSha ? `${lastDeploy.commitSha.slice(0, 7)} · ` : ""}
                          {timeAgo(lastDeploy.createdAt)}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-muted">never deployed</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Badge tone={projectTone[p.status]}>{p.status}</Badge>
                    {health && health.status !== "unknown" ? (
                      <span className={cn("inline-flex items-center gap-1 text-[11px]", health.status === "healthy" ? "text-success" : "text-danger")}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", health.status === "healthy" ? "bg-success" : "bg-danger")} />
                        {health.status === "healthy" ? "healthy" : "down"}
                      </span>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {online ? (
            <Link
              href={`/projects/new?server=${serverId}`}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-white/15 px-3 py-2 text-xs text-muted transition hover:border-accent/50 hover:text-accent"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              New project
            </Link>
          ) : null}
        </>
      )}
    </GlassCard>
  );
}
