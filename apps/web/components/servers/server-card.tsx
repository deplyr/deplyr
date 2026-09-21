import Link from "next/link";
import { ArrowUpRight, Clock, Container, Cpu, Plus, Waypoints } from "lucide-react";
import type { ProjectSummary, ServerSummary } from "@deplyr/shared-types";
import { GlassCard } from "@/components/ui/glass-card";
import { RingGauge } from "@/components/dashboard/ring-gauge";
import { ServerStatusBadge } from "@/components/servers/server-status-badge";
import { timeAgo } from "@/lib/time-ago";
import { cn } from "@/lib/cn";

const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN ?? "deplyr.app";
const MAX_PROJECTS = 3;

const projectDot: Record<ProjectSummary["status"], string> = {
  live: "bg-success",
  deploying: "bg-warning animate-pulse",
  failed: "bg-danger",
  created: "bg-muted",
};

const statusGlow: Record<ServerSummary["status"], string> = {
  connected: "bg-success/20",
  installing: "bg-warning/20",
  pending: "bg-white/10",
  error: "bg-danger/20",
};

/**
 * A server and everything running on it. The whole card links to the server;
 * project rows sit above that overlay link so they stay independently
 * clickable (an <a> can't nest inside another <a>).
 */
export function ServerCard({
  server,
  projects,
  style,
}: {
  server: ServerSummary;
  projects: ProjectSummary[];
  style?: React.CSSProperties;
}) {
  const online = server.status === "connected";
  const shown = projects.slice(0, MAX_PROJECTS);
  const extra = projects.length - shown.length;
  const liveCount = projects.filter((p) => p.status === "live").length;

  return (
    <div className="animate-fade-up" style={style}>
      <GlassCard hover className="relative h-full" innerClassName="relative flex h-full flex-col overflow-hidden">
        <Link
          href={`/servers/${server.id}`}
          aria-label={`Open ${server.name}`}
          className="absolute inset-0 z-0 rounded-2xl"
        />
        <div
          className={cn(
            "pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full blur-[60px]",
            statusGlow[server.status],
          )}
        />

        {/* header */}
        <div className="pointer-events-none relative flex items-start justify-between gap-3 p-5 pb-0">
          <div className="flex min-w-0 items-center gap-3.5">
            <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <Cpu className="h-5 w-5" strokeWidth={1.5} />
              <span
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0c0c10]",
                  online ? "bg-success" : server.status === "error" ? "bg-danger" : "bg-warning animate-pulse",
                )}
              />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{server.name}</p>
              <p className="mt-0.5 truncate font-mono text-xs text-muted">{server.ipAddress}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ServerStatusBadge status={server.status} />
            <ArrowUpRight className="h-4 w-4 text-muted" strokeWidth={1.75} />
          </div>
        </div>

        {/* resources */}
        {online ? (
          <div className="pointer-events-none relative mt-5 flex justify-around px-5">
            <RingGauge label="cpu" value={server.cpuPercent} size={72} />
            <RingGauge label="mem" value={server.memPercent} size={72} />
            <RingGauge label="disk" value={server.diskPercent} size={72} />
          </div>
        ) : (
          <p className="pointer-events-none relative mt-5 px-5 text-xs leading-relaxed text-muted">
            {server.statusDetail ?? "Waiting for the agent to connect…"}
          </p>
        )}

        {/* projects on this server */}
        <div className="relative mt-5 flex-1 border-t border-white/[0.07] p-5">
          <div className="pointer-events-none mb-2.5 flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
              Projects · {projects.length}
            </p>
            {projects.length > 0 ? (
              <span className="text-[11px] text-muted">{liveCount} live</span>
            ) : null}
          </div>

          {shown.length === 0 ? (
            <p className="pointer-events-none text-xs leading-relaxed text-muted">
              Nothing deployed here yet.
            </p>
          ) : (
            <ul className="space-y-1">
              {shown.map((p) => (
                <li key={p.id} className="relative z-10">
                  <Link
                    href={`/projects/${p.id}`}
                    className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-white/[0.06]"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/[0.05] font-mono text-xs font-semibold text-accent">
                      {p.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">{p.name}</span>
                      <span className="block truncate font-mono text-[10px] text-muted">
                        {p.subdomain}.{APP_DOMAIN}
                      </span>
                    </span>
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", projectDot[p.status])} title={p.status} />
                  </Link>
                </li>
              ))}
              {extra > 0 ? (
                <li className="pointer-events-none px-2 pt-1 text-[11px] text-muted">+{extra} more</li>
              ) : null}
            </ul>
          )}

          {online ? (
            <Link
              href={`/projects/new?server=${server.id}`}
              className="relative z-10 mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-white/15 px-2.5 py-1.5 text-xs text-muted transition hover:border-accent/50 hover:text-accent"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              New project
            </Link>
          ) : null}
        </div>

        {/* footer */}
        <div className="pointer-events-none relative flex items-center gap-4 border-t border-white/[0.07] bg-black/20 px-5 py-3 text-[11px] text-muted">
          <span className={cn("flex items-center gap-1.5", server.dockerInstalled && "text-foreground/80")}>
            <Container className="h-3.5 w-3.5" strokeWidth={1.75} />
            Docker
          </span>
          <span className={cn("flex items-center gap-1.5", server.agentConnectedAt && "text-foreground/80")}>
            <Waypoints className="h-3.5 w-3.5" strokeWidth={1.75} />
            Agent
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />
            {server.agentConnectedAt ? `up ${timeAgo(server.agentConnectedAt).replace(" ago", "")}` : `added ${timeAgo(server.createdAt)}`}
          </span>
        </div>
      </GlassCard>
    </div>
  );
}
