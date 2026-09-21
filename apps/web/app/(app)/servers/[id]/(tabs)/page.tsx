"use client";

import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
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
import { GlassCard } from "@/components/ui/glass-card";
import { SectionTitle } from "@/components/ui/section-title";
import { timeAgo } from "@/lib/time-ago";
import { cn } from "@/lib/cn";

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
    <GlassCard hover={Boolean(href)} innerClassName="flex items-center gap-4 p-5">
      <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", tone === "danger" ? "bg-danger/10 text-danger" : "bg-accent/10 text-accent")}>
        <Icon className="h-5 w-5" strokeWidth={1.5} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted">{label}</p>
        <p className="mt-0.5 font-sans text-2xl font-semibold leading-tight">{value}</p>
        <p className={cn("truncate text-[11px]", tone === "danger" ? "text-danger" : "text-muted")}>{sub}</p>
      </div>
      {href ? <ArrowUpRight className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} /> : null}
    </GlassCard>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
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
      <section className="grid animate-fade-up gap-4 sm:grid-cols-3">
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
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {online ? (
            <GlassCard className="animate-fade-up" style={{ animationDelay: "70ms" }} innerClassName="p-6">
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
            </GlassCard>
          ) : null}

          {server.metricsUpdatedAt !== null ? (
            <GlassCard className="animate-fade-up" style={{ animationDelay: "105ms" }} innerClassName="p-6">
              <SectionTitle icon={Activity}>Performance</SectionTitle>
              <MetricsHistory serverId={server.id} cpuCores={server.cpuCores} />
            </GlassCard>
          ) : null}

          <GlassCard className="animate-fade-up" style={{ animationDelay: "140ms" }} innerClassName="p-6">
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
          </GlassCard>
        </div>

        <div className="space-y-6">
          <GlassCard className="animate-fade-up" style={{ animationDelay: "100ms" }} innerClassName="p-6">
            <SectionTitle icon={Fingerprint}>Connection</SectionTitle>
            <div className="divide-y divide-white/[0.06]">
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
          </GlassCard>

          {server.cpuCores || server.memTotalMb || server.diskTotalGb || server.uptimeSeconds ? (
            <GlassCard className="animate-fade-up" style={{ animationDelay: "140ms" }} innerClassName="p-6">
              <SectionTitle icon={Cpu}>System</SectionTitle>
              <div className="divide-y divide-white/[0.06]">
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
            </GlassCard>
          ) : null}

          <GlassCard className="animate-fade-up" style={{ animationDelay: "170ms" }} innerClassName="p-6">
            <SectionTitle icon={Activity}>Health checks</SectionTitle>
            <ul className="space-y-3">
              {checks.map(({ icon: Icon, label, done }) => (
                <li key={label} className="flex items-center gap-3 text-sm">
                  <span className={cn("flex h-7 w-7 items-center justify-center rounded-full", done ? "bg-success/15 text-success" : "border border-white/15 text-muted")}>
                    <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                  </span>
                  <span className={done ? "" : "text-muted"}>{label}</span>
                  <span className={cn("ml-auto text-xs", done ? "text-success" : "text-muted")}>{done ? "ok" : "pending"}</span>
                </li>
              ))}
            </ul>
          </GlassCard>
        </div>
      </div>
    </>
  );
}
