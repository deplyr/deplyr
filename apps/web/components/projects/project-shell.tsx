"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink, GitBranch, Globe, History, KeyRound, LayoutDashboard, Loader2, Lock, ScrollText, Server as ServerIcon, Settings2, Unlock, type LucideIcon } from "lucide-react";
import { DeployButton } from "@/components/deploys/deploy-button";
import { FrameworkBadge } from "@/components/projects/framework-badge";
import { HealthIndicator } from "@/components/projects/health-indicator";
import { useProject } from "@/components/projects/project-context";
import { projectTone } from "@/components/projects/project-card";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { NestedPageContext, Page } from "@/components/ui/page";
import { cn } from "@/lib/cn";

const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN ?? "deplyr.app";

interface Tab {
  slug: string;
  label: string;
  icon: LucideIcon;
  count?: number;
  attention?: boolean;
  /** Extra path prefixes that keep this tab highlighted. */
  also?: string[];
}

export function ProjectShell({ children }: { children: React.ReactNode }) {
  const { project, health, deploys, secrets, server } = useProject();
  const pathname = usePathname();
  const base = `/projects/${project.id}`;
  const url = `${project.subdomain}.${APP_DOMAIN}`;
  const deploying = project.status === "deploying";
  const live = project.status === "live";

  const unset = secrets.filter((s) => !s.hasValue).length;
  const tabs: Tab[] = [
    { slug: "", label: "Overview", icon: LayoutDashboard },
    { slug: "/deployments", label: "Deployments", icon: History, count: deploys.length, also: ["/deploys"] },
    { slug: "/domains", label: "Domains", icon: Globe },
    { slug: "/secrets", label: "Environment", icon: KeyRound, count: secrets.length || undefined, attention: unset > 0 },
    { slug: "/logs", label: "Logs", icon: ScrollText },
    { slug: "/settings", label: "Settings", icon: Settings2 },
  ];
  const isActive = (t: Tab) =>
    t.slug === "" ? pathname === base : [t.slug, ...(t.also ?? [])].some((s) => pathname === base + s || pathname.startsWith(`${base}${s}/`));

  // Deploy progress for the banner: how far the newest deploy has got.
  const latest = deploys[0];
  const steps = latest?.steps ?? [];
  const done = steps.filter((s) => s.status === "success").length;
  const running = steps.find((s) => s.status === "running");

  return (
    <Page>
      <Link href={server ? `/servers/${server.id}/projects` : "/servers"} className="-mb-2 inline-flex w-fit items-center gap-1.5 text-sm text-muted transition hover:text-foreground">
        ← {server ? server.name : "Servers"}
      </Link>

      <GlassCard className="relative z-30 animate-fade-up" innerClassName="relative">
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[calc(1rem-1px)]">
          <div className={cn("absolute -right-16 -top-24 h-72 w-72 rounded-full blur-[90px]", live ? "bg-success/15" : project.status === "failed" ? "bg-danger/20" : deploying ? "bg-warning/15" : "bg-white/5")} />
          <div className="absolute -left-16 -top-24 h-64 w-64 rounded-full bg-accent/15 blur-[90px]" />
        </div>

        <div className="relative flex flex-wrap items-start justify-between gap-6 p-6 sm:p-8">
          <div className="flex min-w-0 items-start gap-5">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent/10 font-mono text-2xl font-semibold text-accent shadow-lg shadow-accent/10">
              {project.name.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <h1 className="truncate font-mono text-2xl font-semibold tracking-tight">{project.name}</h1>
              <a href={`http://${url}`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1.5 font-mono text-sm text-accent transition hover:underline">
                {url}
                <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
              </a>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                <Badge tone={projectTone[project.status]}>{project.status}</Badge>
                <FrameworkBadge framework={project.framework} />
                <HealthIndicator health={health} />
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                    project.defaultDomainHttps ? "border-success/25 bg-success/10 text-success" : "border-white/10 bg-white/[0.05] text-muted",
                  )}
                  title={project.defaultDomainHttps ? "HTTPS is on for the default address" : "No wildcard certificate configured — HTTP only"}
                >
                  {project.defaultDomainHttps ? <Lock className="h-3 w-3" strokeWidth={1.75} /> : <Unlock className="h-3 w-3" strokeWidth={1.75} />}
                  {project.defaultDomainHttps ? "HTTPS" : "HTTP"}
                </span>
                <a
                  href={`https://github.com/${project.githubRepo}/tree/${project.githubBranch}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] px-2.5 py-1 font-mono text-muted transition hover:text-foreground"
                >
                  <GitBranch className="h-3 w-3" strokeWidth={1.75} />
                  {project.githubRepo}@{project.githubBranch}
                </a>
                {server ? (
                  <Link href={`/servers/${server.id}`} className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] px-2.5 py-1 text-muted transition hover:text-foreground">
                    <ServerIcon className="h-3 w-3" strokeWidth={1.75} />
                    {server.name}
                  </Link>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-start gap-3">
            {live ? (
              <a href={`http://${url}`} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
                Visit
                <ExternalLink className="h-4 w-4" strokeWidth={1.75} />
              </a>
            ) : null}
            {project.framework ? (
              <DeployButton projectId={project.id} disabled={deploying} disabledReason={deploying ? "A deploy is already in progress." : undefined} />
            ) : null}
          </div>
        </div>

        {deploying && latest ? (
          <Link href={`${base}/deploys/${latest.id}`} className="relative block border-t border-white/[0.07] px-6 py-3.5 transition hover:bg-white/[0.03] sm:px-8">
            <div className="flex items-center gap-3 text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-warning" />
              <span className="font-medium">Deploying</span>
              <span className="text-muted">{running ? `— ${running.name.replace(/_/g, " ")}` : ""}</span>
              <span className="ml-auto font-mono text-xs text-muted">
                {done} / {steps.length || 8}
              </span>
            </div>
            <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-warning transition-all duration-700" style={{ width: `${(done / (steps.length || 8)) * 100}%` }} />
            </div>
          </Link>
        ) : null}
      </GlassCard>

      <nav aria-label="Project sections" className="sticky top-[4.25rem] z-20 rounded-2xl border border-white/10 bg-[#0c0c10]/80 px-2 shadow-lg shadow-black/30 backdrop-blur-xl">
        <ul className="flex gap-1 overflow-x-auto py-1.5">
          {tabs.map((t) => {
            const active = isActive(t);
            const Icon = t.icon;
            return (
              <li key={t.slug || "overview"}>
                <Link
                  href={base + t.slug}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium transition",
                    active ? "bg-white/[0.08] text-foreground" : "text-muted hover:bg-white/[0.04] hover:text-foreground",
                  )}
                >
                  <Icon className={cn("h-4 w-4", active && "text-accent")} strokeWidth={1.75} />
                  {t.label}
                  {t.count !== undefined ? (
                    <span className={cn("rounded-full px-1.5 py-px font-mono text-[11px]", t.attention ? "bg-warning/15 text-warning" : active ? "bg-accent/15 text-accent" : "bg-white/[0.07] text-muted")}>
                      {t.count}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Subpages are also routable on their own; inside here they drop their
          own frame and back link (see NestedPageContext). */}
      <NestedPageContext.Provider value>{children}</NestedPageContext.Provider>
    </Page>
  );
}
