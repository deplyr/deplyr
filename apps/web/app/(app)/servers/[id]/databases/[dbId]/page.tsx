"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  Clock,
  Container,
  HardDrive,
  Loader2,
  MemoryStick,
  Play,
  RotateCw,
  ScrollText,
  Settings2,
  Square,
  Trash2,
} from "lucide-react";
import type { DatabaseAction, DatabaseSummary, ServerSummary } from "@deplyr/shared-types";
import { DatabaseConnection } from "@/components/databases/database-connection";
import { DatabaseMetrics, fmtMb } from "@/components/databases/database-metrics";
import { DbStatusPill } from "@/components/databases/db-status-pill";
import { LogViewer } from "@/components/logs/log-viewer";
import { Button } from "@/components/ui/button";
import { FormError, inputClass } from "@/components/ui/field";
import { FlatCard } from "@/components/ui/flat-card";
import { Page, PageHeader } from "@/components/ui/page";
import { SectionTitle } from "@/components/ui/section-title";
import { ENGINE_META, isBusy } from "@/lib/database-meta";
import { timeAgo } from "@/lib/time-ago";
import { cn } from "@/lib/cn";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-hover p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold leading-none">{value}</p>
      {sub ? <p className="mt-1.5 text-[11px] text-muted">{sub}</p> : null}
    </div>
  );
}

function ConfigRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 text-xs">
      <span className="text-muted">{label}</span>
      <span className="min-w-0 truncate text-right font-mono">{children}</span>
    </div>
  );
}

export default function DatabaseDetailPage() {
  const { id: serverId, dbId } = useParams<{ id: string; dbId: string }>();
  const router = useRouter();
  const [database, setDatabase] = useState<DatabaseSummary | null>(null);
  const [server, setServer] = useState<ServerSummary | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [acting, setActing] = useState<DatabaseAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/databases/${dbId}`, { credentials: "include" });
      if (res.status === 404) {
        // Gone — either never existed, or it just finished being removed.
        setNotFound(true);
        return;
      }
      if (res.ok) setDatabase(await res.json());
    } catch {
      /* keep what we have */
    }
  }, [dbId]);

  useEffect(() => {
    load();
    fetch(`${API_URL}/servers/${serverId}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setServer)
      .catch(() => {});
  }, [load, serverId]);

  const busy = database ? isBusy(database) : false;
  useEffect(() => {
    if (notFound) return;
    const timer = setInterval(load, busy ? 2000 : 15_000);
    return () => clearInterval(timer);
  }, [load, busy, notFound]);

  // A delete in flight ends with the row disappearing — go back to the server.
  useEffect(() => {
    if (notFound && deleting) router.replace(`/servers/${serverId}/databases`);
  }, [notFound, deleting, router, serverId]);

  async function act(action: DatabaseAction) {
    setActing(action);
    setActionError(null);
    try {
      const res = await fetch(`${API_URL}/databases/${dbId}/actions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) setActionError((await res.json().catch(() => null))?.error ?? "That didn't work.");
      await load();
    } finally {
      setActing(null);
    }
  }

  async function remove(force = false) {
    setDeleting(true);
    setActionError(null);
    const res = await fetch(`${API_URL}/databases/${dbId}${force ? "?force=1" : ""}`, { method: "DELETE", credentials: "include" });
    if (!res.ok) {
      setActionError("Couldn't delete this database.");
      setDeleting(false);
      return;
    }
    if (force) router.replace(`/servers/${serverId}/databases`);
    else await load();
  }

  if (notFound && !deleting) {
    return (
      <Page width="narrow">
        <PageHeader back={{ href: `/servers/${serverId}`, label: "Back to server" }} title="Database not found" />
      </Page>
    );
  }

  if (!database) {
    return (
      <Page>
        <div className="h-16 animate-pulse rounded-xl bg-surface-hover" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="h-80 animate-pulse rounded-xl bg-surface-hover lg:col-span-2" />
          <div className="h-80 animate-pulse rounded-xl bg-surface-hover" />
        </div>
      </Page>
    );
  }

  const meta = ENGINE_META[database.type];
  const Icon = meta.icon;
  const s = database.stats ?? {};
  const fmt = (v: number | null | undefined, suffix = "") => (v === null || v === undefined ? "—" : `${v}${suffix}`);
  const maxmemory = database.memoryLimitMb ? Math.floor(database.memoryLimitMb * 0.75) : null;
  const running = database.status === "running";
  const canOperate = !busy && server?.status === "connected";

  return (
    <Page>
      <PageHeader back={{ href: `/servers/${serverId}/databases`, label: server ? `${server.name} · Databases` : "Databases" }} />

      {/* hero */}
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex min-w-0 items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Icon className="h-5 w-5" strokeWidth={1.5} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{database.name}</h1>
              <DbStatusPill database={database} />
            </div>
            <p className="mt-1.5 font-mono text-sm text-muted">
              {meta.label} {database.version} · 127.0.0.1:{database.port}
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
              {database.latencyMs !== null && database.isUp ? (
                <span className="inline-flex items-center gap-1.5">
                  <Activity className="h-3 w-3" strokeWidth={1.75} />
                  probe {database.latencyMs} ms
                </span>
              ) : null}
              {database.lastCheckedAt ? (
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3 w-3" strokeWidth={1.75} />
                  checked {timeAgo(database.lastCheckedAt)}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {database.status === "stopped" ? (
            <Button onClick={() => act("start")} disabled={!canOperate || acting !== null}>
              {acting === "start" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" strokeWidth={1.75} />}
              Start
            </Button>
          ) : null}
          {running || database.status === "error" ? (
            <Button variant="secondary" onClick={() => act("restart")} disabled={!canOperate || acting !== null}>
              {acting === "restart" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" strokeWidth={1.75} />}
              Restart
            </Button>
          ) : null}
          {running ? (
            <Button variant="secondary" onClick={() => act("stop")} disabled={!canOperate || acting !== null}>
              {acting === "stop" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" strokeWidth={1.75} />}
              Stop
            </Button>
          ) : null}
        </div>
      </div>

      {actionError ? <FormError>{actionError}</FormError> : null}

      {database.status === "error" ? (
        <div className="flex items-start gap-3 rounded-2xl border border-danger/25 bg-danger/[0.06] p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" strokeWidth={1.75} />
          <div className="text-sm leading-relaxed">
            <p className="font-medium">This database isn&apos;t running</p>
            <p className="mt-1 text-muted">{database.statusDetail ?? "Something went wrong."}</p>
          </div>
        </div>
      ) : running && database.isUp === false ? (
        <div className="flex items-start gap-3 rounded-2xl border border-danger/25 bg-danger/[0.06] p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" strokeWidth={1.75} />
          <p className="text-sm leading-relaxed">
            The container is up but the database isn&apos;t answering health checks. Try restarting it.
          </p>
        </div>
      ) : null}

      {/* live numbers */}
      {running && database.stats ? (
        <section className="animate-fade-up grid grid-cols-2 gap-3 lg:grid-cols-6" style={{ animationDelay: "50ms" }}>
          {database.type === "redis" ? (
            <>
              <Tile label="Hit rate" value={s.hitRate == null ? "—" : `${s.hitRate}%`} sub={s.hitRate == null ? "no reads yet" : "since last sample"} />
              <Tile label="Memory" value={fmt(s.memUsedMb) === "—" ? "—" : fmtMb(s.memUsedMb ?? 0)} sub={maxmemory ? `of ${fmtMb(maxmemory)} max` : "no limit"} />
              <Tile label="Ops / sec" value={fmt(s.opsPerSec)} />
              <Tile label="Clients" value={fmt(s.clients)} />
              <Tile label="Keys" value={fmt(s.keys)} />
              <Tile label="Evicted" value={fmt(s.evictedKeys)} sub="since last sample" />
            </>
          ) : (
            <>
              <Tile label="Connections" value={fmt(s.connections)} sub={s.maxConnections ? `of ${s.maxConnections} max` : undefined} />
              <Tile label="Cache hit" value={s.cacheHitRatio == null ? "—" : `${s.cacheHitRatio}%`} sub={s.cacheHitRatio == null ? "no reads yet" : "since last sample"} />
              <Tile label="Transactions" value={s.tps == null ? "—" : `${s.tps}/s`} />
              <Tile label="Size" value={s.sizeMb == null ? "—" : fmtMb(s.sizeMb)} />
            </>
          )}
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <FlatCard className="animate-fade-up p-6" style={{ animationDelay: "70ms" }}>
            <SectionTitle icon={Activity}>Performance</SectionTitle>
            <DatabaseMetrics
              databaseId={database.id}
              type={database.type}
              memoryLimitMb={database.memoryLimitMb}
              maxConnections={typeof s.maxConnections === "number" ? s.maxConnections : null}
            />
          </FlatCard>

          <FlatCard className="animate-fade-up p-6" style={{ animationDelay: "115ms" }}>
            <SectionTitle icon={ScrollText} meta="read from the container, never stored">
              Logs
            </SectionTitle>
            <LogViewer endpoint={`/databases/${database.id}/logs`} filename={database.name} />
          </FlatCard>

          {/* danger zone */}
          <FlatCard className="animate-fade-up p-6" style={{ animationDelay: "160ms" }}>
            <SectionTitle icon={Trash2}>Delete database</SectionTitle>
            <p className="text-xs leading-relaxed text-muted">
              Removes the container <span className="font-medium text-foreground">and all its data</span>. This can&apos;t be undone.
              {database.projectId ? " The connection string in the linked project's secrets is removed too." : ""}
            </p>
            {!confirming ? (
              <Button variant="danger" className="mt-4" onClick={() => setConfirming(true)} disabled={busy}>
                <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                Delete…
              </Button>
            ) : (
              <div className="mt-4 space-y-3">
                <label className="block text-xs text-muted">
                  Type <span className="font-mono font-semibold text-foreground">{database.name}</span> to confirm
                  <input
                    value={confirmName}
                    onChange={(e) => setConfirmName(e.target.value)}
                    autoFocus
                    className={cn(inputClass, "mt-1.5 font-mono")}
                  />
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="danger" disabled={confirmName !== database.name || deleting} onClick={() => remove()}>
                    {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" strokeWidth={1.75} />}
                    {deleting ? "Deleting…" : "Delete permanently"}
                  </Button>
                  <Button variant="secondary" onClick={() => { setConfirming(false); setConfirmName(""); }} disabled={deleting}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            {database.status === "error" ? (
              <button
                onClick={() => remove(true)}
                className="mt-4 block text-xs text-muted underline-offset-2 transition hover:text-foreground hover:underline"
              >
                Server unreachable? Remove just the record
              </button>
            ) : null}
          </FlatCard>
        </div>

        <div className="space-y-6">
          <DatabaseConnection database={database} serverIp={server?.ipAddress ?? null} />

          <FlatCard className="animate-fade-up p-6" style={{ animationDelay: "130ms" }}>
            <SectionTitle icon={Settings2}>Configuration</SectionTitle>
            <div className="divide-y divide-border">
              <ConfigRow label="Engine">
                {meta.label} {database.version}
              </ConfigRow>
              <ConfigRow label="Memory limit">{database.memoryLimitMb ? fmtMb(database.memoryLimitMb) : "none"}</ConfigRow>
              {database.type === "redis" ? (
                <>
                  <ConfigRow label="maxmemory">{maxmemory ? fmtMb(maxmemory) : "unbounded"}</ConfigRow>
                  <ConfigRow label="Eviction">{String(database.config.policy ?? "—")}</ConfigRow>
                  <ConfigRow label="Persistence">{String(database.config.persistence ?? "none").toUpperCase()}</ConfigRow>
                </>
              ) : null}
              <ConfigRow label="Container">{database.containerName}</ConfigRow>
              <ConfigRow label="Volume">{database.containerName}-data</ConfigRow>
              <ConfigRow label="Created">
                {new Date(database.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
              </ConfigRow>
            </div>
            <div className="mt-4 flex items-center gap-4 border-t border-border pt-4 text-[11px] text-muted">
              <span className="flex items-center gap-1.5"><Container className="h-3.5 w-3.5" strokeWidth={1.75} />Docker</span>
              <span className="flex items-center gap-1.5"><HardDrive className="h-3.5 w-3.5" strokeWidth={1.75} />Persistent volume</span>
              {database.memoryLimitMb ? <span className="flex items-center gap-1.5"><MemoryStick className="h-3.5 w-3.5" strokeWidth={1.75} />Capped</span> : null}
            </div>
          </FlatCard>
        </div>
      </div>
    </Page>
  );
}
