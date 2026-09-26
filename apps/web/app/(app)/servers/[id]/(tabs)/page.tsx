"use client";

import Link from "next/link";
import {
  Activity,
  Boxes,
  CalendarDays,
  Container,
  Cpu,
  Database,
  Fingerprint,
  Gauge,
  Globe,
  HardDrive,
  ListChecks,
  MemoryStick,
  Terminal,
  Timer,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import { ActivityLog } from "@/components/activity/activity-log";
import { RingGauge } from "@/components/dashboard/ring-gauge";
import { MetricsHistory } from "@/components/servers/metrics-history";
import { useServer } from "@/components/servers/server-context";
import { InfoRow, UsageBar, formatUptime, gb } from "@/components/servers/server-parts";
import { CopyButton } from "@/components/ui/copy-button";
import { FlatCard } from "@/components/ui/flat-card";
import { SectionTitle } from "@/components/ui/section-title";
import { timeAgo } from "@/lib/time-ago";
import { cn } from "@/lib/cn";

// One divided strip, three facets of it — not three separate widgets with
// wasted gaps between them (same fix as the dashboard's stat row).
function Glance({
  href,
  icon: Icon,
  label,
  value,
  sub,
  tone = "default",
}: {
  href?: string;
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  tone?: "default" | "danger";
}) {
  const body = (
    <>
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
        {label}
      </div>
      <p className={cn("mt-2 text-3xl font-semibold tracking-tight", tone === "danger" ? "text-danger" : "text-foreground")}>{value}</p>
      <p className={cn("mt-1 text-xs", tone === "danger" ? "text-danger" : "text-muted")}>{sub}</p>
    </>
  );
  if (!href) return <div className="p-5">{body}</div>;
  return (
    <Link href={href} className="block p-5 transition hover:bg-surface-hover">
      {body}
    </Link>
  );
}

export default function ServerOverviewTab() {
  const { server, counts, online, stale } = useServer();
  const base = `/servers/${server.id}`;
  const sshCommand = `ssh root@${server.ipAddress}`;

  const checks = [
    { icon: Terminal, label: "SSH session", done: server.status !== "pending" },
    { icon: Container, label: "Docker installed", done: server.dockerInstalled },
    { icon: Waypoints, label: "Agent connected", done: server.agentConnectedAt !== null },
    { icon: Activity, label: "Reporting metrics", done: server.metricsUpdatedAt !== null && !stale },
  ];

  const dbs = counts.databases;
  const projects = counts.projects;

  return (
    <>
      {/* where to go next */}
      <FlatCard className="animate-fade-up overflow-hidden">
        <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Glance
            href={`${base}/databases`}
            icon={Database}
            label="Databases"
            value={dbs ? String(dbs.total) : "—"}
            sub={!dbs ? "loading" : dbs.total === 0 ? "none yet" : dbs.unhealthy > 0 ? `${dbs.unhealthy} need attention` : "all healthy"}
            tone={dbs && dbs.unhealthy > 0 ? "danger" : "default"}
          />
          <Glance
            href={`${base}/projects`}
            icon={Boxes}
            label="Projects"
            value={projects ? String(projects.total) : "—"}
            sub={!projects ? "loading" : projects.total === 0 ? "none yet" : `${projects.live} live`}
          />
          <Glance
            icon={Timer}
            label="Server uptime"
            value={server.uptimeSeconds !== null ? formatUptime(server.uptimeSeconds) : "—"}
            sub={server.loadAvg1 !== null ? `load ${server.loadAvg1.toFixed(2)}` : "not reported yet"}
          />
        </div>
      </FlatCard>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {online ? (
            <FlatCard className="animate-fade-up p-6" style={{ animationDelay: "70ms" }}>
              <SectionTitle
                icon={Activity}
                meta={
                  server.metricsUpdatedAt ? (
                    <span className={cn("inline-flex items-center gap-1.5", stale && "text-warning")}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", stale ? "bg-warning" : "animate-pulse bg-success")} />
                      {stale ? "stale" : "live"} · updated {timeAgo(server.metricsUpdatedAt)}
                    </span>
                  ) : undefined
                }
              >
                Resources
              </SectionTitle>
              {server.metricsUpdatedAt === null ? (
                <p className="py-8 text-center text-sm text-muted">Waiting for the first metrics report…</p>
              ) : (
                <div className="grid items-center gap-8 sm:grid-cols-2">
                  <div className="flex justify-around gap-2">
                    <RingGauge label="cpu" value={server.cpuPercent} size={96} />
                    <RingGauge label="memory" value={server.memPercent} size={96} />
                    <RingGauge label="disk" value={server.diskPercent} size={96} />
                  </div>
                  <div className="space-y-4">
                    <UsageBar
                      label="CPU"
                      value={server.cpuPercent}
                      hint={server.cpuCores ? `${server.cpuCores} ${server.cpuCores === 1 ? "core" : "cores"}${server.loadAvg1 !== null ? ` · load ${server.loadAvg1.toFixed(2)}` : ""}` : "Processor load across all cores"}
                    />
                    <UsageBar
                      label="Memory"
                      value={server.memPercent}
                      hint={server.memTotalMb && server.memPercent !== null ? `${gb((server.memTotalMb * server.memPercent) / 100)} of ${gb(server.memTotalMb)} GB` : "RAM in use, including caches"}
                    />
                    <UsageBar
                      label="Disk"
                      value={server.diskPercent}
                      hint={server.diskTotalGb && server.diskPercent !== null ? `${Math.round((server.diskTotalGb * server.diskPercent) / 100)} of ${server.diskTotalGb} GB` : "Space used on /var/lib/deplyr"}
                    />
                  </div>
                </div>
              )}
            </FlatCard>
          ) : null}

          {server.metricsUpdatedAt !== null ? (
            <FlatCard className="animate-fade-up p-6" style={{ animationDelay: "105ms" }}>
              <SectionTitle icon={Activity}>Performance</SectionTitle>
              <MetricsHistory serverId={server.id} cpuCores={server.cpuCores} />
            </FlatCard>
          ) : null}

          <FlatCard className="animate-fade-up p-6" style={{ animationDelay: "140ms" }}>
            <SectionTitle
              icon={ListChecks}
              meta={
                <Link href={`${base}/activity`} className="transition hover:text-foreground">
                  View all
                </Link>
              }
            >
              Recent activity
            </SectionTitle>
            <ActivityLog serverId={server.id} limit={6} filters={false} loadMore={false} />
          </FlatCard>
        </div>

        <div className="space-y-6">
          <FlatCard className="animate-fade-up p-6" style={{ animationDelay: "100ms" }}>
            <SectionTitle icon={Fingerprint}>Connection</SectionTitle>
            <div className="divide-y divide-border">
              <InfoRow icon={Globe} label="IP address">
                <span className="font-mono">{server.ipAddress}</span>
                <CopyButton value={server.ipAddress} label="IP address" />
              </InfoRow>
              <InfoRow icon={Terminal} label="SSH">
                <span className="max-w-[9rem] truncate font-mono">{sshCommand}</span>
                <CopyButton value={sshCommand} label="SSH command" />
              </InfoRow>
              <InfoRow icon={CalendarDays} label="Added">
                {new Date(server.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
              </InfoRow>
              <InfoRow icon={Waypoints} label="Agent">
                {server.agentConnectedAt ? `connected ${timeAgo(server.agentConnectedAt)}` : "not connected"}
              </InfoRow>
              <InfoRow icon={Fingerprint} label="Server ID">
                <span className="max-w-[7rem] truncate font-mono">{server.id}</span>
                <CopyButton value={server.id} label="server ID" />
              </InfoRow>
            </div>
          </FlatCard>

          {server.cpuCores || server.memTotalMb || server.diskTotalGb || server.uptimeSeconds ? (
            <FlatCard className="animate-fade-up p-6" style={{ animationDelay: "140ms" }}>
              <SectionTitle icon={Cpu}>System</SectionTitle>
              <div className="divide-y divide-border">
                {server.cpuCores ? (
                  <InfoRow icon={Cpu} label="CPU">
                    {server.cpuCores} {server.cpuCores === 1 ? "core" : "cores"}
                  </InfoRow>
                ) : null}
                {server.memTotalMb ? (
                  <InfoRow icon={MemoryStick} label="Memory">
                    {gb(server.memTotalMb)} GB
                  </InfoRow>
                ) : null}
                {server.diskTotalGb ? (
                  <InfoRow icon={HardDrive} label="Disk">
                    {server.diskTotalGb} GB
                  </InfoRow>
                ) : null}
                {server.uptimeSeconds !== null ? (
                  <InfoRow icon={Timer} label="Uptime">
                    {formatUptime(server.uptimeSeconds)}
                  </InfoRow>
                ) : null}
                {server.loadAvg1 !== null ? (
                  <InfoRow icon={Gauge} label="Load (1m)">
                    <span className="font-mono">{server.loadAvg1.toFixed(2)}</span>
                  </InfoRow>
                ) : null}
              </div>
            </FlatCard>
          ) : null}

          <FlatCard className="animate-fade-up p-6" style={{ animationDelay: "170ms" }}>
            <SectionTitle icon={Activity}>Health checks</SectionTitle>
            <ul className="space-y-3">
              {checks.map(({ icon: Icon, label, done }) => (
                <li key={label} className="flex items-center gap-3 text-sm">
                  <span className={cn("flex h-7 w-7 items-center justify-center rounded-full", done ? "bg-success/15 text-success" : "border border-border text-muted")}>
                    <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                  </span>
                  <span className={done ? "" : "text-muted"}>{label}</span>
                  <span className={cn("ml-auto text-xs", done ? "text-success" : "text-muted")}>{done ? "ok" : "pending"}</span>
                </li>
              ))}
            </ul>
          </FlatCard>
        </div>
      </div>
    </>
  );
}
