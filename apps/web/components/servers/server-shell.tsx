"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Boxes, Clock, Cpu, Database, LayoutDashboard, ListChecks, type LucideIcon } from "lucide-react";
import { ServerStatusBadge } from "@/components/servers/server-status-badge";
import { InstallProgress } from "@/components/servers/install-progress";
import { NewServiceMenu } from "@/components/servers/new-service-menu";
import { ServerOptionsMenu } from "@/components/servers/server-options-menu";
import { useServer } from "@/components/servers/server-context";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import { Page, PageHeader } from "@/components/ui/page";
import { timeAgo } from "@/lib/time-ago";
import { cn } from "@/lib/cn";

interface Tab {
  slug: string;
  label: string;
  icon: LucideIcon;
  count?: number | null;
  attention?: boolean;
}

export function ServerShell({ children }: { children: React.ReactNode }) {
  const { server, counts, online, stale } = useServer();
  const pathname = usePathname();
  const base = `/servers/${server.id}`;
  const settingUp = server.status === "pending" || server.status === "installing" || server.status === "error";

  const tabs: Tab[] = [
    { slug: "", label: "Overview", icon: LayoutDashboard },
    { slug: "/databases", label: "Databases", icon: Database, count: counts.databases?.total, attention: (counts.databases?.unhealthy ?? 0) > 0 },
    { slug: "/projects", label: "Projects", icon: Boxes, count: counts.projects?.total },
    { slug: "/activity", label: "Activity", icon: ListChecks },
  ];

  const isActive = (slug: string) => (slug === "" ? pathname === base : pathname === base + slug || pathname.startsWith(`${base}${slug}/`));

  return (
    <Page>
      <PageHeader back={{ href: "/servers", label: "All servers" }} />

      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex min-w-0 items-start gap-4">
          <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Cpu className="h-5 w-5" strokeWidth={1.5} />
            <span
              className={cn(
                "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background",
                online ? "bg-success" : server.status === "error" ? "bg-danger" : "animate-pulse bg-warning",
              )}
            />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{server.name}</h1>
              <ServerStatusBadge status={server.status} />
              {stale ? <Badge tone="warning">no heartbeat</Badge> : null}
            </div>
            <div className="mt-1.5 flex items-center gap-1">
              <span className="font-mono text-sm text-muted">{server.ipAddress}</span>
              <CopyButton value={server.ipAddress} label="IP address" />
              {server.agentConnectedAt ? (
                <span className="ml-2.5 inline-flex items-center gap-1.5 text-xs text-muted">
                  <Clock className="h-3 w-3" strokeWidth={1.75} />
                  agent up {timeAgo(server.agentConnectedAt).replace(" ago", "")}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {online ? <NewServiceMenu serverId={server.id} databaseCount={counts.databases?.total ?? 0} /> : null}
          <ServerOptionsMenu server={server} />
        </div>
      </div>

      {settingUp ? <InstallProgress server={server} /> : null}

      {stale ? (
        <div className="flex items-start gap-3 rounded-xl border border-warning/25 bg-warning/[0.06] p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" strokeWidth={1.75} />
          <p className="text-sm leading-relaxed">
            No report from the agent for {timeAgo(server.metricsUpdatedAt).replace(" ago", "")}. The server may be offline, or the agent
            may have stopped.
          </p>
        </div>
      ) : null}

      {/* A toolbar that stays under the top bar while a tab's content
          scrolls, so the sections are always one click away. */}
      <nav aria-label="Server sections" className="sticky top-[4.25rem] z-20 rounded-xl border border-border bg-surface p-1.5 shadow-sm">
        <ul className="flex gap-1 overflow-x-auto">
          {tabs.map(({ slug, label, icon: Icon, count, attention }) => {
            const active = isActive(slug);
            return (
              <li key={slug || "overview"}>
                <Link
                  href={base + slug}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition",
                    active ? "bg-surface-hover text-foreground" : "text-muted hover:bg-surface-hover hover:text-foreground",
                  )}
                >
                  <Icon className={cn("h-4 w-4", active && "text-accent")} strokeWidth={1.75} />
                  {label}
                  {count !== undefined && count !== null ? (
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-px font-mono text-[11px]",
                        attention ? "bg-danger/15 text-danger" : active ? "bg-accent/15 text-accent" : "bg-surface-hover text-muted",
                      )}
                    >
                      {count}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {children}
    </Page>
  );
}
