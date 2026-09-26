"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, ArrowUpDown, Bell, Boxes, CircleAlert, Cpu, Database, KeyRound, Loader2, Rocket, Search, Server, type LucideIcon } from "lucide-react";
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
  info: "bg-surface-hover text-muted ring-border",
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

/** Small mono, uppercase-tracked pill — same treatment for every status
 * word in the table (category, actor, the works), not just one column. */
function MiniBadge({ tone, children }: { tone: "success" | "danger" | "muted"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider",
        tone === "success" ? "bg-success/15 text-success" : tone === "danger" ? "bg-danger/15 text-danger" : "bg-surface-hover text-muted",
      )}
    >
      {children}
    </span>
  );
}

/** Real <table>, row click navigates (useRouter, not a <Link> per row) —
 * a <tr> can't itself be an anchor, only its cells can, so the whole-row
 * click target has to be handled in JS instead, same as any real log
 * table does it. */
function ActivityTable({ events, showServer }: { events: AuditEventDTO[]; showServer: boolean }) {
  const router = useRouter();
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-border bg-surface-hover text-xs text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Event</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Actor</th>
              {showServer ? <th className="px-4 py-3 font-medium">Server</th> : null}
              <th className="px-4 py-3 text-right font-medium">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {events.map((e) => {
              const meta = CATEGORY_META[e.category];
              const Icon = e.status === "failure" ? CircleAlert : meta?.icon ?? Cpu;
              const href = hrefFor(e);
              const tone = e.status === "success" ? "success" : e.status === "failure" ? "danger" : "muted";
              return (
                <tr
                  key={e.id}
                  onClick={href ? () => router.push(href) : undefined}
                  className={cn("group transition-colors hover:bg-surface-hover", href && "cursor-pointer")}
                >
                  <td className="max-w-[320px] px-4 py-3.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors",
                          tone === "success"
                            ? "bg-success/10 text-success group-hover:bg-success/20"
                            : tone === "danger"
                              ? "bg-danger/10 text-danger group-hover:bg-danger/20"
                              : "bg-surface text-muted group-hover:bg-surface-hover",
                        )}
                      >
                        <Icon className="h-4 w-4" strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium leading-snug">{e.summary}</p>
                        {e.detail ? (
                          <p className={cn("truncate font-mono text-xs", e.status === "failure" ? "text-danger/80" : "text-muted")} title={e.detail}>
                            {e.detail}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <MiniBadge tone="muted">{meta?.label ?? e.category}</MiniBadge>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">{ACTOR_LABEL[e.actor]}</td>
                  {showServer ? <td className="max-w-[140px] truncate px-4 py-3 text-xs text-muted">{e.serverName ?? "—"}</td> : null}
                  <td className="whitespace-nowrap px-4 py-3 text-right text-xs text-muted">
                    <time dateTime={e.createdAt} title={new Date(e.createdAt).toLocaleString()}>
                      {timeAgo(e.createdAt)}
                    </time>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-border bg-surface-hover px-4 py-3 text-xs text-muted">
        Showing {events.length} {events.length === 1 ? "event" : "events"}
      </div>
    </div>
  );
}

export function ActivityLog({
  serverId,
  resourceId,
  limit = 20,
  filters = true,
  showServer = false,
  loadMore = true,
  variant = "list",
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
  /** "list": timeline of cards, for a compact panel (dashboard, project
   * overview). "table": columns, for the dedicated Activity page where
   * scanning many events at once matters more than each one's detail. */
  variant?: "list" | "table";
}) {
  const [category, setCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
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

  // Search and sort work over whatever's already loaded, client-side —
  // category is the one filter that goes back to the server (it changes
  // which page of events even exists to page through); these two don't
  // need a round trip since they only ever narrow or reorder what's
  // already in hand.
  const visibleEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? events.filter((e) =>
          [e.summary, e.detail, e.action, e.actor, e.serverName, CATEGORY_META[e.category]?.label ?? e.category]
            .filter(Boolean)
            .some((field) => field!.toLowerCase().includes(q)),
        )
      : events;
    return sort === "oldest" ? [...filtered].reverse() : filtered;
  }, [events, search, sort]);

  return (
    <div>
      {filters ? (
        <div className="mb-4 flex flex-col gap-2 rounded-xl border border-border bg-surface p-2 shadow-sm sm:flex-row sm:items-center">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={1.75} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search this page's events…"
              className="w-full rounded-lg bg-transparent py-2 pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted"
            />
          </div>
          <div className="flex items-center gap-2 sm:border-l sm:border-border sm:pl-2">
            <label className="sr-only" htmlFor="activity-category">Category</label>
            <select
              id="activity-category"
              value={category ?? ""}
              onChange={(e) => setCategory(e.target.value || null)}
              className="cursor-pointer rounded-lg bg-transparent px-2 py-2 text-sm font-medium text-foreground outline-none"
            >
              <option value="">Everything</option>
              {AUDIT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_META[c]?.label ?? c}
                </option>
              ))}
            </select>
            <span className="h-5 w-px bg-border" />
            <label className="sr-only" htmlFor="activity-sort">Sort</label>
            <div className="relative flex items-center">
              <ArrowUpDown className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-muted" strokeWidth={1.75} />
              <select
                id="activity-sort"
                value={sort}
                onChange={(e) => setSort(e.target.value as "newest" | "oldest")}
                className="cursor-pointer rounded-lg bg-transparent py-2 pl-7 pr-2 text-sm font-medium text-foreground outline-none"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </div>
          </div>
        </div>
      ) : null}

      {failed && !latest ? (
        <p className="py-10 text-center text-sm text-muted">Couldn&apos;t load activity. It will retry shortly.</p>
      ) : latest === null ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-surface-hover" />
          ))}
        </div>
      ) : visibleEvents.length === 0 ? (
        <div className="flex flex-col items-center py-10 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Activity className="h-5 w-5" strokeWidth={1.5} />
          </span>
          <p className="mt-3 text-sm font-medium">{category || search ? "Nothing matches" : "No activity yet"}</p>
          <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted">
            {category || search
              ? "Try a different search term or category."
              : "Deploys, database changes, installs and alerts are recorded here as they happen."}
          </p>
        </div>
      ) : variant === "table" ? (
        <ActivityTable events={visibleEvents} showServer={showServer} />
      ) : (
        <ol className="relative">
          <span className="absolute bottom-4 left-[17px] top-4 w-px bg-gradient-to-b from-border via-border to-transparent" />
          {visibleEvents.map((e) => {
            const meta = CATEGORY_META[e.category];
            const Icon = e.status === "failure" ? CircleAlert : meta?.icon ?? Cpu;
            const href = hrefFor(e);
            const row = (
              <div className="relative flex items-start gap-4 rounded-xl px-1 py-2.5 transition hover:bg-surface-hover">
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
                    <span className="rounded bg-surface-hover px-1.5 py-px font-medium">{ACTOR_LABEL[e.actor]}</span>
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
          className="mx-auto mt-4 flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-xs text-muted transition hover:bg-surface-hover hover:text-foreground disabled:opacity-60"
        >
          {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Load older
        </button>
      ) : null}
    </div>
  );
}
