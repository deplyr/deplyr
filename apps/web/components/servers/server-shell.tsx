"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Boxes, Clock, Cpu, Database, LayoutDashboard, ListChecks, type LucideIcon } from "lucide-react";
import { ServerStatusBadge } from "@/components/servers/server-status-badge";
import { InstallProgress } from "@/components/servers/install-progress";
import { NewServiceMenu } from "@/components/servers/new-service-menu";
import { useServer } from "@/components/servers/server-context";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import { GlassCard } from "@/components/ui/glass-card";
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

      <GlassCard className="relative z-30 animate-fade-up" innerClassName="relative">
        {/* Only this decorative layer is clipped — clipping the whole card would
            also cut off the "New" dropdown, which hangs below it. */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[calc(1rem-1px)]">
          <div
            className={cn(
              "absolute -right-16 -top-24 h-72 w-72 rounded-full blur-[90px]",
              online ? "bg-success/15" : server.status === "error" ? "bg-danger/20" : "bg-warning/15",
            )}
          />
          <div className="absolute -left-16 -top-24 h-64 w-64 rounded-full bg-accent/15 blur-[90px]" />
        </div>
        <div className="relative flex flex-wrap items-start justify-between gap-6 p-6 sm:p-8">
          <div className="flex min-w-0 items-start gap-5">
            <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent shadow-lg shadow-accent/10">
              <Cpu className="h-6 w-6" strokeWidth={1.5} />
              <span
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#0c0c10]",
                  online ? "bg-success" : server.status === "error" ? "bg-danger" : "animate-pulse bg-warning",
                )}
              />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="truncate font-mono text-2xl font-semibold tracking-tight">{server.name}</h1>
                <ServerStatusBadge status={server.status} />
                {stale ? <Badge tone="warning">no heartbeat</Badge> : null}
              </div>
              <div className="mt-1.5 flex items-center gap-1">
                <span className="font-mono text-sm text-muted">{server.ipAddress}</span>
                <CopyButton value={server.ipAddress} label="IP address" />
              </div>
              {server.agentConnectedAt ? (
                <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] px-2.5 py-1 text-xs text-muted">
                  <Clock className="h-3 w-3" strokeWidth={1.75} />
                  agent up {timeAgo(server.agentConnectedAt).replace(" ago", "")}
                </p>
              ) : null}
            </div>
          </div>
          {online ? <NewServiceMenu serverId={server.id} databaseCount={counts.databases?.total ?? 0} /> : null}
        </div>
      </GlassCard>

      {settingUp ? <InstallProgress server={server} /> : null}

      {stale ? (
        <div className="flex items-start gap-3 rounded-2xl border border-warning/25 bg-warning/[0.06] p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" strokeWidth={1.75} />
          <p className="text-sm leading-relaxed">
            No report from the agent for {timeAgo(server.metricsUpdatedAt).replace(" ago", "")}. The server may be offline, or the agent
            may have stopped.
          </p>
        </div>
      ) : null}

      {/* A floating toolbar that stays under the top bar while a tab's content
          scrolls, so the sections are always one click away. */}
      <nav
        aria-label="Server sections"
        className="sticky top-[4.25rem] z-20 rounded-2xl border border-white/10 bg-[#0c0c10]/80 px-2 shadow-lg shadow-black/30 backdrop-blur-xl"
      >
        <ul className="flex gap-1 overflow-x-auto py-1.5">
          {tabs.map(({ slug, label, icon: Icon, count, attention }) => {
            const active = isActive(slug);
            return (
              <li key={slug || "overview"}>
                <Link
                  href={base + slug}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium transition",
                    active ? "bg-white/[0.08] text-foreground" : "text-muted hover:bg-white/[0.04] hover:text-foreground",
                  )}
                >
                  <Icon className={cn("h-4 w-4", active && "text-accent")} strokeWidth={1.75} />
                  {label}
                  {count !== undefined && count !== null ? (
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-px font-mono text-[11px]",
                        attention ? "bg-danger/15 text-danger" : active ? "bg-accent/15 text-accent" : "bg-white/[0.07] text-muted",
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
