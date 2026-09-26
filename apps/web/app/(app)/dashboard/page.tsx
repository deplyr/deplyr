import Link from "next/link";
import { Suspense } from "react";
import {
  ArrowRight,
  Boxes,
  Check,
  CircleAlert,
  Github,
  ListChecks,
  Plus,
  Rocket,
  Server as ServerIcon,
} from "lucide-react";
import type { AuthUser, OverviewSummary, ProjectSummary, ServerSummary } from "@deplyr/shared-types";
import { ServerCard } from "@/components/servers/server-card";
import { ActivityLog } from "@/components/activity/activity-log";
import { AppHealthPanel, DatabasesPanel } from "@/components/dashboard/health-panels";
import { FlatCard } from "@/components/ui/flat-card";
import { SectionTitle } from "@/components/ui/section-title";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/cn";

async function getJson<T>(path: string, fallback: T): Promise<T> {
  const res = await apiFetch(path);
  return res.ok ? res.json() : fallback;
}

const delay = (i: number) => ({ animationDelay: `${i * 70}ms` });

/** One cell in the stats strip below — not a card of its own. A row of
 * bordered boxes reads as four separate widgets; dividers read as one
 * dataset with four facets, which is what these actually are. Clickable
 * where there's actually somewhere more useful to land — a bare number
 * with no way to act on it is a dead end. */
function StatCell({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  href,
}: {
  label: string;
  value: number;
  hint: string;
  icon: typeof Boxes;
  tone?: "default" | "success" | "danger";
  href?: string;
}) {
  const valueTone = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-foreground";
  const body = (
    <>
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
        {label}
      </div>
      <p className={cn("mt-2 text-3xl font-semibold tracking-tight", valueTone)}>{value}</p>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </>
  );
  if (!href) return <div className="p-5">{body}</div>;
  return (
    <Link href={href} className="block p-5 transition hover:bg-surface-hover">
      {body}
    </Link>
  );
}

function AddTile({ href, label, icon: Icon }: { href: string; label: string; icon: typeof Plus }) {
  return (
    <Link
      href={href}
      className="group flex min-h-[9.5rem] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border text-muted transition hover:border-accent/50 hover:bg-accent/[0.04] hover:text-accent"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-current/30 transition group-hover:scale-110">
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <span className="text-sm font-medium">{label}</span>
    </Link>
  );
}

/** Matches DashboardContent's actual shape (not a generic spinner) so the
 * layout doesn't visibly jump once real data lands. Scoped to just this
 * page via the Suspense boundary below, not a folder-level loading.tsx —
 * that file cascades to every other route under (app) that doesn't have
 * its own, which would flash this exact dashboard shape while navigating
 * to, say, /settings. */
function DashboardSkeleton() {
  const pulse = "animate-pulse rounded-xl bg-surface-hover";
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div className="space-y-2.5">
          <div className={cn(pulse, "h-7 w-64")} />
          <div className={cn(pulse, "h-4 w-48")} />
        </div>
        <div className="flex gap-3">
          <div className={cn(pulse, "h-10 w-32")} />
          <div className={cn(pulse, "h-10 w-36")} />
        </div>
      </div>
      <div className={cn(pulse, "h-28")} />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className={cn(pulse, "h-96 lg:col-span-3")} />
        <div className={cn(pulse, "h-96 lg:col-span-2")} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className={cn(pulse, "h-40")} />
        <div className={cn(pulse, "h-40")} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}

async function DashboardContent() {
  const [user, servers, projects, overview] = await Promise.all([
    getJson<AuthUser | null>("/auth/me", null),
    getJson<ServerSummary[]>("/servers", []),
    getJson<ProjectSummary[]>("/projects", []),
    getJson<OverviewSummary>("/overview", { events: [], health: [], databases: [] }),
  ]);

  const connected = servers.filter((s) => s.status === "connected");
  const live = projects.filter((p) => p.status === "live");
  const attention =
    projects.filter((p) => p.status === "failed").length +
    servers.filter((s) => s.status === "error").length +
    overview.health.filter((h) => h.status === "unhealthy").length;

  const steps = [
    { done: Boolean(user?.githubLogin), icon: Github, title: "Connect GitHub", hint: "So Deplyr can read your repos", href: "/settings" },
    { done: connected.length > 0, icon: ServerIcon, title: "Connect a server", hint: "Any VPS — set up over SSH", href: "/servers/new" },
    { done: projects.length > 0, icon: Boxes, title: "Create a project", hint: "Pick a repo and a branch", href: "/projects/new" },
    { done: live.length > 0, icon: Rocket, title: "Deploy it", hint: "One click, live on the internet", href: "/projects" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const nextStep = steps.find((s) => !s.done);
  const name = user?.githubLogin ?? user?.email.split("@")[0] ?? "there";

  const healthy = attention === 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      {/* header — plain, no card. A bordered "hero" around a greeting was
          decoration, not content; a page title earns a box when it holds
          data, not when it's just typography. The pill only shows up when
          something's actually wrong — silence is the "all clear" signal,
          not another banner saying so. */}
      <div className="flex flex-wrap items-center justify-between gap-5 animate-fade-up">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">
              Welcome back, <span className="text-accent">{name}</span>
            </h1>
            {!healthy ? (
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-danger/25 bg-danger/10 px-2.5 py-0.5 text-xs font-medium text-danger">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
                </span>
                {attention} {attention === 1 ? "needs" : "need"} attention
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted">
            {live.length} {live.length === 1 ? "app is" : "apps are"} live across{" "}
            {connected.length} {connected.length === 1 ? "server" : "servers"}.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/projects/new"
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition hover:brightness-110"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            New project
          </Link>
          <Link
            href="/servers/new"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface-hover px-4 py-2.5 text-sm font-medium transition hover:bg-surface"
          >
            <ServerIcon className="h-4 w-4" strokeWidth={1.75} />
            Connect server
          </Link>
        </div>
      </div>

      {/* stats — one strip, four facets of it, not four separate widgets. */}
      <FlatCard className="animate-fade-up overflow-hidden" style={delay(1)}>
        <div className="grid grid-cols-2 divide-y divide-border sm:grid-cols-4 sm:divide-x sm:divide-y-0">
          <StatCell label="Servers" value={connected.length} hint={`${servers.length} registered`} icon={ServerIcon} href="/servers" />
          <StatCell label="Projects" value={projects.length} hint="from GitHub repos" icon={Boxes} href="/projects" />
          <StatCell label="Live" value={live.length} hint="serving traffic" icon={Rocket} tone="success" href="/projects" />
          <StatCell
            label="Needs attention"
            value={attention}
            hint={healthy ? "all clear" : "down apps, failed deploys or servers"}
            icon={CircleAlert}
            tone={healthy ? "default" : "danger"}
            href="/activity"
          />
        </div>
      </FlatCard>

      {/* onboarding */}
      {doneCount < steps.length ? (
        <FlatCard className="animate-fade-up overflow-hidden" style={delay(5)}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
            <div>
              <h2 className="text-sm font-semibold">Get to your first deploy</h2>
              <p className="mt-0.5 text-xs text-muted">{doneCount} of {steps.length} done</p>
            </div>
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-surface-hover">
              <div className="h-full rounded-full bg-accent" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
            </div>
          </div>
          <ol className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, i) => {
              const isNext = step === nextStep;
              return (
                <li key={step.title} className="bg-surface">
                  <Link href={step.href} className={cn("group flex h-full flex-col gap-3 p-5 transition hover:bg-surface-hover", step.done && "opacity-60")}>
                    <span
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold",
                        step.done ? "bg-success/15 text-success" : isNext ? "bg-accent text-accent-foreground" : "border border-border text-muted",
                      )}
                    >
                      {step.done ? <Check className="h-4 w-4" strokeWidth={2.5} /> : i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium">{step.title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted">{step.hint}</p>
                    </div>
                    {isNext ? (
                      <span className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-accent">
                        Start <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ol>
        </FlatCard>
      ) : null}

      {/* activity + health — the right column is short by nature (2 small
          panels vs. a feed), so it's sticky instead of stretched: it travels
          with you as you scroll rather than ending in a block of empty
          space once its own content runs out. The feed itself stays short
          on purpose (5 items, not "however many happened") and hands off
          to the full Activity page (sidebar) for anything more. */}
      <section className="grid gap-6 lg:grid-cols-5">
        <div className="animate-fade-up lg:col-span-3" style={delay(6)}>
          <FlatCard className="p-6">
            <SectionTitle
              icon={ListChecks}
              meta={
                <Link href="/activity" className="transition hover:text-foreground">
                  See all
                </Link>
              }
            >
              Recent activity
            </SectionTitle>
            <ActivityLog limit={5} filters={false} loadMore={false} showServer />
          </FlatCard>
        </div>
        <div className="animate-fade-up sticky top-[4.25rem] h-fit space-y-6 lg:col-span-2" style={delay(7)}>
          <AppHealthPanel rows={overview.health} />
          <DatabasesPanel rows={overview.databases} />
        </div>
      </section>

      {/* servers */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <Link href="/servers" className="text-sm font-semibold transition hover:text-accent">Servers</Link>
          <Link href="/servers" className="text-xs text-muted transition hover:text-foreground">Manage</Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {servers.map((s, i) => (
            <ServerCard
              key={s.id}
              server={s}
              projects={projects.filter((p) => p.serverId === s.id)}
              style={delay(8 + i)}
            />
          ))}
          <AddTile href="/servers/new" label="Connect a server" icon={Plus} />
        </div>
      </section>
    </div>
  );
}
