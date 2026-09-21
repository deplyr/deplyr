"use client";

import Link from "next/link";
import { Activity, ArrowUpRight, Check, CircleDot, Cpu, GitBranch, History, ListChecks, Loader2, Rocket, X, type LucideIcon } from "lucide-react";
import { resolveBuildPlan, type DeployStepSummary } from "@deplyr/shared-types";
import { ActivityLog } from "@/components/activity/activity-log";
import { DatabaseCard } from "@/components/databases/database-card";
import { DeployStatusBadge } from "@/components/deploys/deploy-status-badge";
import { deployDuration, stripTone } from "@/components/projects/deploy-utils";
import { useProject } from "@/components/projects/project-context";
import { CopyButton } from "@/components/ui/copy-button";
import { GlassCard } from "@/components/ui/glass-card";
import { SectionTitle } from "@/components/ui/section-title";
import { DEPLOY_STEP_LABELS } from "@/lib/deploy-step-labels";
import { timeAgo } from "@/lib/time-ago";
import { cn } from "@/lib/cn";

const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN ?? "deplyr.app";
const FRAMEWORK_LABEL = { nextjs: "Next.js", nestjs: "NestJS", node: "Node.js", dockerfile: "Docker" } as const;

type Tone = "default" | "success" | "danger" | "warning";
const toneStyle: Record<Tone, string> = {
  default: "bg-accent/10 text-accent",
  success: "bg-success/10 text-success",
  danger: "bg-danger/10 text-danger",
  warning: "bg-warning/10 text-warning",
};

function Tile({ icon: Icon, label, value, sub, tone = "default", href }: { icon: LucideIcon; label: string; value: string; sub: string; tone?: Tone; href?: string }) {
  const body = (
    <GlassCard hover={Boolean(href)} innerClassName="flex h-full items-center gap-4 p-5">
      <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", toneStyle[tone])}>
        <Icon className="h-5 w-5" strokeWidth={1.5} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted">{label}</p>
        <p className="mt-0.5 truncate font-sans text-xl font-semibold leading-tight">{value}</p>
        <p className="truncate text-[11px] text-muted">{sub}</p>
      </div>
    </GlassCard>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}

function StepPill({ step }: { step: DeployStepSummary }) {
  const styles = {
    success: "border-success/25 bg-success/10 text-success",
    failed: "border-danger/30 bg-danger/10 text-danger",
    running: "border-warning/30 bg-warning/10 text-warning",
    pending: "border-white/10 bg-white/[0.03] text-muted",
  } as const;
  return (
    <li className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs", styles[step.status])}>
      {step.status === "success" ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : step.status === "failed" ? <X className="h-3.5 w-3.5" strokeWidth={2.5} /> : step.status === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CircleDot className="h-3.5 w-3.5" strokeWidth={1.75} />}
      {DEPLOY_STEP_LABELS[step.name]}
    </li>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-xs">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1 text-right font-medium">{children}</dd>
    </div>
  );
}

export default function ProjectOverview() {
  const { project, health, deploys, database, server } = useProject();
  const base = `/projects/${project.id}`;
  const latest = deploys[0];
  const plan = resolveBuildPlan(project.framework, project.settings);
  const url = `${project.subdomain}.${APP_DOMAIN}`;

  const statusTile: { value: string; tone: Tone } =
    project.status === "live" ? { value: "Live", tone: "success" } : project.status === "deploying" ? { value: "Deploying", tone: "warning" } : project.status === "failed" ? { value: "Failed", tone: "danger" } : { value: "Not deployed", tone: "default" };
  const healthTile: { value: string; tone: Tone } = health.isHealthy === null ? { value: "Not checked", tone: "default" } : health.isHealthy ? { value: "Healthy", tone: "success" } : { value: "Down", tone: "danger" };

  return (
    <>
      <section className="grid animate-fade-up grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile icon={Rocket} label="Status" tone={statusTile.tone} value={statusTile.value} sub={latest ? `${latest.status === "success" ? "Deployed" : "Last deploy"} ${timeAgo(latest.finishedAt ?? latest.createdAt)}` : "Hit Deploy to ship it"} href={latest ? `${base}/deploys/${latest.id}` : undefined} />
        <Tile icon={Activity} label="Health" tone={healthTile.tone} value={healthTile.value} sub={health.lastCheckedAt ? `checked ${timeAgo(health.lastCheckedAt)}` : "checked once it's live"} />
        <Tile icon={GitBranch} label="Last commit" value={latest?.commitSha ? latest.commitSha.slice(0, 7) : "—"} sub={latest ? `${deployDuration(latest) ? `built in ${deployDuration(latest)} · ` : ""}${timeAgo(latest.createdAt)}` : "no deploys yet"} />
        <Tile
          icon={Cpu}
          label="Runtime"
          value={project.framework ? FRAMEWORK_LABEL[project.framework] : "Not supported"}
          sub={project.framework === "dockerfile" ? "your Dockerfile" : project.framework ? `${plan.packageManager} · ${plan.packageManager === "bun" ? "Bun" : `Node ${plan.nodeVersion}`}` : "see build settings"}
          href={`${base}/settings`}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <GlassCard className="animate-fade-up" style={{ animationDelay: "60ms" }} innerClassName="p-6">
            <SectionTitle
              icon={History}
              meta={
                <Link href={`${base}/deployments`} className="transition hover:text-foreground">
                  All deployments
                </Link>
              }
            >
              Latest deployment
            </SectionTitle>

            {latest ? (
              <>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <DeployStatusBadge status={latest.status} />
                  <span className="font-mono text-sm">{latest.commitSha ? latest.commitSha.slice(0, 7) : "—"}</span>
                  <span className="text-xs text-muted">{timeAgo(latest.createdAt)}</span>
                  {deployDuration(latest) ? <span className="font-mono text-xs text-muted">{deployDuration(latest)}</span> : null}
                  <Link href={`${base}/deploys/${latest.id}`} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
                    {latest.status === "failed" ? "See what failed" : "View steps & logs"}
                    <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
                  </Link>
                </div>

                {latest.steps.length ? <ol className="mt-4 flex flex-wrap gap-1.5">{latest.steps.map((s) => <StepPill key={s.name} step={s} />)}</ol> : null}

                {deploys.length > 1 ? (
                  <div className="mt-5 border-t border-white/[0.07] pt-4">
                    <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted">Recent deploys</p>
                    <div className="flex gap-1" aria-hidden>
                      {[...deploys].slice(0, 24).reverse().map((d) => (
                        <Link key={d.id} href={`${base}/deploys/${d.id}`} title={`${d.status} · ${timeAgo(d.createdAt)}`} className={cn("h-6 flex-1 rounded-sm transition hover:opacity-70", stripTone[d.status])} />
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="flex flex-col items-center py-10 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                  <Rocket className="h-5 w-5" strokeWidth={1.5} />
                </span>
                <p className="mt-3 text-sm font-medium">Nothing deployed yet</p>
                <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted">
                  {project.framework ? "Set your environment variables if the app needs any, then hit Deploy." : "Deplyr couldn't work out how to run this repo — check its build settings."}
                </p>
              </div>
            )}
          </GlassCard>

          <GlassCard className="animate-fade-up" style={{ animationDelay: "100ms" }} innerClassName="p-6">
            <SectionTitle icon={ListChecks}>Recent activity</SectionTitle>
            <ActivityLog serverId={project.serverId} resourceId={project.id} limit={6} filters={false} loadMore={false} />
          </GlassCard>
        </div>

        <div className="space-y-6">
          <GlassCard className="animate-fade-up" style={{ animationDelay: "80ms" }} innerClassName="p-6">
            <SectionTitle>Details</SectionTitle>
            <dl className="divide-y divide-white/[0.06]">
              <Fact label="Repository">
                <a href={`https://github.com/${project.githubRepo}`} target="_blank" rel="noreferrer" className="truncate font-mono text-accent hover:underline">
                  {project.githubRepo}
                </a>
              </Fact>
              <Fact label="Branch">
                <span className="font-mono">{project.githubBranch}</span>
              </Fact>
              <Fact label="Server">
                {server ? (
                  <Link href={`/servers/${server.id}`} className="inline-flex items-center gap-1.5 hover:underline">
                    <span className={cn("h-1.5 w-1.5 rounded-full", server.status === "connected" ? "bg-success" : "bg-warning")} />
                    {server.name}
                  </Link>
                ) : (
                  "—"
                )}
              </Fact>
              <Fact label="Port">
                {project.appPort ? (
                  <>
                    <span className="font-mono">{project.appPort}</span>
                    <CopyButton value={String(project.appPort)} label="port" />
                  </>
                ) : (
                  <span className="font-normal text-muted">assigned on first deploy</span>
                )}
              </Fact>
              <Fact label="Address">
                <span className="truncate font-mono">{url}</span>
                <CopyButton value={`http://${url}`} label="address" />
              </Fact>
              {project.framework && project.framework !== "dockerfile" ? (
                <>
                  {plan.rootDir ? (
                    <Fact label="Root folder">
                      <span className="font-mono">{plan.rootDir}</span>
                    </Fact>
                  ) : null}
                  <Fact label="Build">
                    <span className="max-w-[12rem] truncate font-mono" title={plan.build ?? undefined}>{plan.build ?? "skipped"}</span>
                  </Fact>
                  <Fact label="Start">
                    <span className="max-w-[12rem] truncate font-mono" title={plan.start}>{plan.start}</span>
                  </Fact>
                </>
              ) : null}
              <Fact label="Created">{new Date(project.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</Fact>
            </dl>
            <Link href={`${base}/settings`} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
              Edit build settings
              <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
            </Link>
          </GlassCard>

          {project.framework ? <DatabaseCard key={database?.id ?? "none"} projectId={project.id} initial={database} /> : null}
        </div>
      </div>
    </>
  );
}
