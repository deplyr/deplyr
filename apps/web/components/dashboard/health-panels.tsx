import Link from "next/link";
import { Database, HeartPulse } from "lucide-react";
import type { AppHealthRow, AppHealthStatus, DatabaseRow } from "@deplyr/shared-types";
import { GlassCard } from "@/components/ui/glass-card";
import { DbStatusPill } from "@/components/databases/db-status-pill";
import { ENGINE_META } from "@/lib/database-meta";
import { APP_DOMAIN } from "@/lib/app-domain";
import { timeAgo } from "@/lib/time-ago";
import { cn } from "@/lib/cn";

const dot: Record<AppHealthStatus, string> = {
  healthy: "bg-success",
  unhealthy: "bg-danger",
  unknown: "bg-muted",
};

const label: Record<AppHealthStatus, string> = {
  healthy: "Healthy",
  unhealthy: "Down",
  unknown: "Pending",
};

function PanelHeader({ icon: Icon, title, meta }: { icon: typeof HeartPulse; title: string; meta?: string }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-accent" strokeWidth={1.75} />
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {meta ? <span className="text-xs text-muted">{meta}</span> : null}
    </div>
  );
}

export function AppHealthPanel({ rows }: { rows: AppHealthRow[] }) {
  const down = rows.filter((r) => r.status === "unhealthy").length;
  return (
    <GlassCard innerClassName="p-6">
      <PanelHeader
        icon={HeartPulse}
        title="App health"
        meta={rows.length ? (down ? `${down} down` : "all up") : undefined}
      />
      {rows.length === 0 ? (
        <p className="py-4 text-xs leading-relaxed text-muted">
          Live apps are checked every few minutes. Deploy one to see it here.
        </p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.projectId}>
              <Link
                href={`/projects/${r.projectId}`}
                className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-white/[0.04]"
              >
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  {r.status === "healthy" ? (
                    <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-50", dot[r.status])} />
                  ) : null}
                  <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", dot[r.status])} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.name}</p>
                  <p className="truncate font-mono text-[11px] text-muted">
                    {APP_DOMAIN ? `${r.subdomain}.${APP_DOMAIN}` : r.subdomain}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={cn("text-xs font-medium", r.status === "healthy" ? "text-success" : r.status === "unhealthy" ? "text-danger" : "text-muted")}>
                    {label[r.status]}
                  </p>
                  <p className="text-[11px] text-muted">{timeAgo(r.lastCheckedAt)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}

export function DatabasesPanel({ rows }: { rows: DatabaseRow[] }) {
  return (
    <GlassCard innerClassName="p-6">
      <PanelHeader icon={Database} title="Databases" meta={rows.length ? `${rows.length} total` : undefined} />
      {rows.length === 0 ? (
        <p className="py-4 text-xs leading-relaxed text-muted">
          Spin up Postgres or Redis from any server&apos;s page — Deplyr tracks their health here.
        </p>
      ) : (
        <ul className="space-y-1">
          {rows.map((d) => {
            const Icon = ENGINE_META[d.type].icon;
            return (
              <li key={d.id}>
                <Link
                  href={`/servers/${d.serverId}/databases/${d.id}`}
                  className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-white/[0.04]"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <Icon className="h-4 w-4" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{d.name}</p>
                    <p className="truncate text-[11px] text-muted">
                      {ENGINE_META[d.type].label}
                      {d.projectName ? ` · ${d.projectName}` : ""}
                    </p>
                  </div>
                  <DbStatusPill database={{ status: d.status, isUp: d.isUp, statusDetail: null }} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </GlassCard>
  );
}
