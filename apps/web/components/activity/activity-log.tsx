"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, Bell, Boxes, CircleAlert, Cpu, Database, KeyRound, Loader2, Rocket, Server, type LucideIcon } from "lucide-react";
import { AUDIT_CATEGORIES, type AuditActor, type AuditEventDTO, type AuditPage, type AuditStatus } from "@deplyr/shared-types";
import { timeAgo } from "@/lib/time-ago";
import { cn } from "@/lib/cn";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const REFRESH_MS = 15_000;

const CATEGORY_META: Record<string, { label: string; icon: LucideIcon }> = {
  deploy: { label: "Deploys", icon: Rocket },
  database: { label: "Databases", icon: Database },
  server: { label: "Server", icon: Server },
  project: { label: "Projects", icon: Boxes },
  secret: { label: "Secrets", icon: KeyRound },
  alert: { label: "Alerts", icon: Bell },
};

const STATUS_STYLE: Record<AuditStatus, string> = {
  success: "bg-success/10 text-success ring-success/25",
  failure: "bg-danger/10 text-danger ring-danger/25",
  info: "bg-white/[0.05] text-muted ring-white/10",
};

const ACTOR_LABEL: Record<AuditActor, string> = { user: "You", system: "System", agent: "Agent" };

/** Where clicking an event should go, if anywhere. */
function hrefFor(e: AuditEventDTO): string | null {
  if (!e.resourceId) return null;
  if (e.resourceType === "database" && e.serverId) return `/servers/${e.serverId}/databases/${e.resourceId}`;
  if (e.resourceType === "project") return `/projects/${e.resourceId}`;
  if (e.resourceType === "server") return `/servers/${e.resourceId}`;
  return null;
}

export function ActivityLog({
  serverId,
  resourceId,
  limit = 20,
  filters = true,
  showServer = false,
  loadMore = true,
}: {
  /** Scope to one server; omit for everything the user owns. */
  serverId?: string;
  /** Only events about one project / database / server. */
  resourceId?: string;
  limit?: number;
  filters?: boolean;
  /** Name the server on each line — useful when several are mixed together. */
  showServer?: boolean;
  loadMore?: boolean;
}) {
  const [category, setCategory] = useState<string | null>(null);
  const [latest, setLatest] = useState<AuditPage | null>(null);
  const [older, setOlder] = useState<AuditEventDTO[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);

  const url = useCallback(
    (before?: string | null) => {
      const q = new URLSearchParams({ limit: String(limit) });
      if (category) q.set("category", category);
      if (before) q.set("before", before);
      if (resourceId) q.set("resourceId", resourceId);
      const base = serverId ? `${API_URL}/servers/${serverId}/activity` : `${API_URL}/activity`;
      return `${base}?${q}`;
    },
    [serverId, resourceId, limit, category],
  );

  // Newest page: refreshed on a timer. Older pages the user has already
  // loaded stay put, so a refresh never yanks the list back to the top.
  useEffect(() => {
    let cancelled = false;
    setLatest(null);
    setOlder([]);
    async function load() {
      try {
        const res = await fetch(url(), { credentials: "include" });
        if (!res.ok) throw new Error();
        const page: AuditPage = await res.json();
        if (cancelled) return;
        setLatest(page);
        setFailed(false);
        setNextBefore((prev) => (prev === null || older.length === 0 ? page.nextBefore : prev));
      } catch {
        if (!cancelled) setFailed(true);
      }
    }
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // `older` deliberately not a dependency: it must not restart the poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  async function fetchOlder() {
    if (!nextBefore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(url(nextBefore), { credentials: "include" });
      if (!res.ok) throw new Error();
      const page: AuditPage = await res.json();
      setOlder((o) => [...o, ...page.events]);
      setNextBefore(page.nextBefore);
    } catch {
      setFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }

  const events = useMemo(() => {
    const seen = new Set<string>();
    return [...(latest?.events ?? []), ...older].filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
  }, [latest, older]);

  return (
    <div>
      {filters ? (
        <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter activity">
          {[null, ...AUDIT_CATEGORIES].map((c) => {
            const active = c === category;
            return (
              <button
                key={c ?? "all"}
                role="tab"
                aria-selected={active}
                onClick={() => setCategory(c)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition",
                  active ? "border-accent/50 bg-accent/15 text-accent" : "border-white/10 text-muted hover:bg-white/[0.05] hover:text-foreground",
                )}
              >
                {c === null ? "All" : CATEGORY_META[c]?.label ?? c}
              </button>
            );
          })}
        </div>
      ) : null}

      {failed && !latest ? (
        <p className="py-10 text-center text-sm text-muted">Couldn&apos;t load activity. It will retry shortly.</p>
      ) : latest === null ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-white/[0.04]" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center py-10 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Activity className="h-5 w-5" strokeWidth={1.5} />
          </span>
          <p className="mt-3 text-sm font-medium">{category ? "Nothing here yet" : "No activity yet"}</p>
          <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted">
            Deploys, database changes, installs and alerts are recorded here as they happen.
          </p>
        </div>
      ) : (
        <ol className="relative">
          <span className="absolute bottom-4 left-[17px] top-4 w-px bg-gradient-to-b from-white/15 via-white/10 to-transparent" />
          {events.map((e) => {
            const meta = CATEGORY_META[e.category];
            const Icon = e.status === "failure" ? CircleAlert : meta?.icon ?? Cpu;
            const href = hrefFor(e);
            const row = (
              <div className="relative flex items-start gap-4 rounded-xl px-1 py-2.5 transition hover:bg-white/[0.03]">
                <span className={cn("relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1 backdrop-blur", STATUS_STYLE[e.status])}>
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-sm font-medium leading-snug">{e.summary}</p>
                  {e.detail ? (
                    <p className={cn("mt-0.5 line-clamp-2 break-words font-mono text-xs", e.status === "failure" ? "text-danger/80" : "text-muted")} title={e.detail}>
                      {e.detail}
                    </p>
                  ) : null}
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
                    <span className="rounded bg-white/[0.06] px-1.5 py-px font-medium">{ACTOR_LABEL[e.actor]}</span>
                    {showServer && e.serverName ? <span>{e.serverName}</span> : null}
                    <span className="opacity-60">{e.action}</span>
                  </p>
                </div>
                <time
                  className="shrink-0 pt-1 text-xs text-muted"
                  dateTime={e.createdAt}
                  title={new Date(e.createdAt).toLocaleString()}
                >
                  {timeAgo(e.createdAt)}
                </time>
              </div>
            );
            return <li key={e.id}>{href ? <Link href={href}>{row}</Link> : row}</li>;
          })}
        </ol>
      )}

      {loadMore && nextBefore ? (
        <button
          onClick={fetchOlder}
          disabled={loadingMore}
          className="mx-auto mt-4 flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-xs text-muted transition hover:bg-white/[0.05] hover:text-foreground disabled:opacity-60"
        >
          {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Load older
        </button>
      ) : null}
    </div>
  );
}
