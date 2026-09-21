import Link from "next/link";
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
import { RingGauge } from "@/components/dashboard/ring-gauge";
import { ActivityLog } from "@/components/activity/activity-log";
import { AppHealthPanel, DatabasesPanel } from "@/components/dashboard/health-panels";
import { GlassCard } from "@/components/ui/glass-card";
import { SectionTitle } from "@/components/ui/section-title";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/cn";


async function getJson<T>(path: string, fallback: T): Promise<T> {
  const res = await apiFetch(path);
  return res.ok ? res.json() : fallback;
}

const delay = (i: number) => ({ animationDelay: `${i * 70}ms` });

function avg(values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => v !== null);
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  index,
}: {
  label: string;
  value: number;
  hint: string;
  icon: typeof Boxes;
  tone?: "default" | "success" | "danger";
  index: number;
}) {
  const glow =
    tone === "success" ? "bg-success/25" : tone === "danger" ? "bg-danger/25" : "bg-accent/25";
  const iconTone =
    tone === "success"
      ? "bg-success/10 text-success"
      : tone === "danger"
        ? "bg-danger/10 text-danger"
        : "bg-accent/10 text-accent";
  return (
    <GlassCard hover className="animate-fade-up" style={delay(index)} innerClassName="relative overflow-hidden p-5">
      <div className={cn("absolute -right-6 -top-6 h-24 w-24 rounded-full blur-2xl", glow)} />
      <div className="relative flex items-center justify-between">
        <p className="text-xs text-muted">{label}</p>
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", iconTone)}>
          <Icon className="h-4 w-4" strokeWidth={1.75} />
        </span>
      </div>
      <p className="relative mt-3 font-mono text-4xl font-semibold tracking-tight">{value}</p>
      <p className="relative mt-1 text-xs text-muted">{hint}</p>
    </GlassCard>
  );
}

function AddTile({ href, label, icon: Icon }: { href: string; label: string; icon: typeof Plus }) {
  return (
    <Link
      href={href}
      className="group flex min-h-[9.5rem] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/15 text-muted transition hover:border-accent/50 hover:bg-accent/[0.04] hover:text-accent"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-current/30 transition group-hover:scale-110">
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <span className="text-sm font-medium">{label}</span>
    </Link>
  );
}

export default async function DashboardPage() {
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
      {/* hero */}
      <GlassCard className="animate-fade-up" innerClassName="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-20 -top-24 h-72 w-72 rounded-full bg-accent/20 blur-[90px]" />
        <div
          className="pointer-events-none absolute inset-0 opacity-30 [mask-image:radial-gradient(ellipse_at_left,black,transparent_70%)]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.07) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        <div className="relative grid gap-6 p-6 sm:gap-8 sm:p-8 lg:grid-cols-5 lg:p-10">
          <div className="min-w-0 lg:col-span-3">
            <span
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
                healthy
                  ? "border-success/25 bg-success/10 text-success"
                  : "border-danger/25 bg-danger/10 text-danger",
              )}
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
              </span>
              {healthy ? "All systems operational" : `${attention} ${attention === 1 ? "needs" : "need"} attention`}
            </span>
            <h1 className="mt-5 font-mono text-3xl font-semibold leading-tight tracking-tight lg:text-4xl">
              Welcome back,
              <span className="block text-accent">{name}</span>
            </h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
              {live.length} {live.length === 1 ? "app is" : "apps are"} live across{" "}
              {connected.length} {connected.length === 1 ? "server" : "servers"}. Push to GitHub and
              Deplyr takes it from there.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/projects/new"
                className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground shadow-lg shadow-accent/25 transition hover:brightness-110"
              >
                <Plus className="h-4 w-4" strokeWidth={2} />
                New project
              </Link>
              <Link
                href="/servers/new"
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium transition hover:bg-white/[0.08]"
              >
                <ServerIcon className="h-4 w-4" strokeWidth={1.75} />
                Connect server
              </Link>
            </div>
          </div>

          <div className="flex min-w-0 flex-col justify-center rounded-2xl border border-white/[0.07] bg-black/30 p-5 sm:p-6 lg:col-span-2">
            <div className="mb-5 flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted">Fleet health</p>
              <span className="text-xs text-muted">
                {connected.length} online
              </span>
            </div>
            <div className="flex justify-between">
              <RingGauge label="cpu" value={avg(connected.map((s) => s.cpuPercent))} />
              <RingGauge label="mem" value={avg(connected.map((s) => s.memPercent))} />
              <RingGauge label="disk" value={avg(connected.map((s) => s.diskPercent))} />
            </div>
          </div>
        </div>
      </GlassCard>

      {/* stats */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard index={1} label="Servers" value={connected.length} hint={`${servers.length} registered`} icon={ServerIcon} />
        <StatCard index={2} label="Projects" value={projects.length} hint="from GitHub repos" icon={Boxes} />
        <StatCard index={3} label="Live" value={live.length} hint="serving traffic" icon={Rocket} tone="success" />
        <StatCard
          index={4}
          label="Needs attention"
          value={attention}
          hint={healthy ? "all clear" : "down apps, failed deploys or servers"}
          icon={CircleAlert}
          tone={healthy ? "default" : "danger"}
        />
      </section>

      {/* onboarding */}
      {doneCount < steps.length ? (
        <GlassCard className="animate-fade-up" style={delay(5)} innerClassName="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-6 py-4">
            <div>
              <h2 className="text-sm font-semibold">Get to your first deploy</h2>
              <p className="mt-0.5 text-xs text-muted">{doneCount} of {steps.length} done</p>
            </div>
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-accent" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
            </div>
          </div>
          <ol className="grid gap-px bg-white/5 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, i) => {
              const isNext = step === nextStep;
              return (
                <li key={step.title} className="bg-[#0c0c10]">
                  <Link href={step.href} className={cn("group flex h-full flex-col gap-3 p-5 transition hover:bg-white/[0.03]", step.done && "opacity-60")}>
                    <span
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold",
                        step.done ? "bg-success/15 text-success" : isNext ? "bg-accent text-accent-foreground" : "border border-white/15 text-muted",
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
        </GlassCard>
      ) : null}

      {/* activity + health */}
      <section className="grid gap-6 lg:grid-cols-5">
        <div className="animate-fade-up lg:col-span-3" style={delay(6)}>
          <GlassCard className="h-full" innerClassName="p-6">
            <SectionTitle icon={ListChecks} meta="across all servers">
              Recent activity
            </SectionTitle>
            <ActivityLog limit={8} filters={false} loadMore={false} showServer />
          </GlassCard>
        </div>
        <div className="animate-fade-up space-y-6 lg:col-span-2" style={delay(7)}>
          <AppHealthPanel rows={overview.health} />
          <DatabasesPanel rows={overview.databases} />
        </div>
      </section>

      {/* servers */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Servers</h2>
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
