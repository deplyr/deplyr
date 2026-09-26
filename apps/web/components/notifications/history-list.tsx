"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, History, Info, Loader2, Search, TriangleAlert } from "lucide-react";
import type { NotificationChannelDTO, NotificationHistoryDTO, NotificationHistoryPage } from "@deplyr/shared-types";
import { CHANNEL_META, EVENT_LABEL } from "@/components/notifications/channel-meta";
import { SectionTitle } from "@/components/ui/section-title";
import { timeAgo } from "@/lib/time-ago";
import { cn } from "@/lib/cn";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const PAGE_SIZE = 15;
const REFRESH_MS = 15_000;

type StatusFilter = "all" | "sent" | "failed";

/** Where clicking a row should go, if anywhere — the project it's about,
 * or failing that the server. */
function hrefFor(n: NotificationHistoryDTO): string | null {
  if (n.projectId) return `/projects/${n.projectId}`;
  if (n.serverId) return `/servers/${n.serverId}`;
  return null;
}

export function HistoryList({ channels, refreshKey }: { channels: NotificationChannelDTO[]; refreshKey: number }) {
  const router = useRouter();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [channelId, setChannelId] = useState("");
  const [search, setSearch] = useState("");
  const [latest, setLatest] = useState<NotificationHistoryPage | null>(null);
  const [older, setOlder] = useState<NotificationHistoryDTO[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);

  const url = useCallback(
    (before?: string | null) => {
      const q = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (status !== "all") q.set("status", status);
      if (channelId) q.set("channelId", channelId);
      if (before) q.set("before", before);
      return `${API_URL}/notifications/history?${q}`;
    },
    [status, channelId],
  );

  useEffect(() => {
    let cancelled = false;
    setOlder([]);
    async function load() {
      try {
        const res = await fetch(url(), { credentials: "include" });
        if (!res.ok) throw new Error();
        const page: NotificationHistoryPage = await res.json();
        if (cancelled) return;
        setLatest(page);
        setNextBefore(page.nextBefore);
        setFailed(false);
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
    // refreshKey: reload right away after a test send / channel change.
  }, [url, refreshKey]);

  async function fetchOlder() {
    if (!nextBefore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(url(nextBefore), { credentials: "include" });
      const page: NotificationHistoryPage = await res.json();
      setOlder((o) => [...o, ...page.items]);
      setNextBefore(page.nextBefore);
    } finally {
      setLoadingMore(false);
    }
  }

  const items = useMemo(() => {
    const seen = new Set<string>();
    return [...(latest?.items ?? []), ...older].filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)));
  }, [latest, older]);

  // Search is client-side over whatever's already loaded, same reasoning
  // as the Activity table: it only ever narrows what's in hand, so there's
  // nothing a round trip would buy here.
  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((n) =>
      [n.title, n.message, n.channelName, n.projectName, n.serverName, EVENT_LABEL[n.event] ?? n.event]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q)),
    );
  }, [items, search]);

  return (
    <div className="animate-fade-up" style={{ animationDelay: "120ms" }}>
      <SectionTitle icon={History} meta="every message Deplyr has tried to send">
        History
      </SectionTitle>

      <div className="mb-4 flex flex-col gap-2 rounded-xl border border-border bg-surface p-2 shadow-sm sm:flex-row sm:items-center">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={1.75} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search this page's messages…"
            className="w-full rounded-lg bg-transparent py-2 pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted"
          />
        </div>
        <div className="flex items-center gap-2 sm:border-l sm:border-border sm:pl-2">
          <label className="sr-only" htmlFor="history-status">Status</label>
          <select
            id="history-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="cursor-pointer rounded-lg bg-transparent px-2 py-2 text-sm font-medium text-foreground outline-none"
          >
            <option value="all">Everything</option>
            <option value="sent">Delivered</option>
            <option value="failed">Failed</option>
          </select>
          {channels.length > 1 ? (
            <>
              <span className="h-5 w-px bg-border" />
              <label className="sr-only" htmlFor="history-channel">Channel</label>
              <select
                id="history-channel"
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                className="cursor-pointer rounded-lg bg-transparent px-2 py-2 text-sm font-medium text-foreground outline-none"
              >
                <option value="">All channels</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </>
          ) : null}
        </div>
      </div>

      {failed && !latest ? (
        <p className="py-10 text-center text-sm text-muted">Couldn&apos;t load history. It will retry shortly.</p>
      ) : latest === null ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-surface-hover" />
          ))}
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-border py-12 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <History className="h-5 w-5" strokeWidth={1.5} />
          </span>
          <p className="mt-3 text-sm font-medium">{status === "all" && !channelId && !search ? "Nothing sent yet" : "Nothing matches"}</p>
          <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted">
            {status === "all" && !channelId && !search
              ? "When an app goes down, a deploy finishes or a server drops, it shows up here — along with whether it was delivered."
              : "Try a different search term or filter."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-border bg-surface-hover text-xs text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Message</th>
                  <th className="px-4 py-3 font-medium">Event</th>
                  <th className="px-4 py-3 font-medium">Channel</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibleItems.map((n) => {
                  const meta = CHANNEL_META[n.channelType];
                  const Icon = meta.icon;
                  const isTest = n.event === "test";
                  const tone = isTest || n.level === "info" ? "muted" : n.level === "critical" ? "danger" : "success";
                  const href = hrefFor(n);
                  return (
                    <tr
                      key={n.id}
                      onClick={href ? () => router.push(href) : undefined}
                      className={cn("group transition-colors hover:bg-surface-hover", href && "cursor-pointer")}
                    >
                      <td className="max-w-[340px] px-4 py-3.5">
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
                            {tone === "success" ? <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} /> : tone === "danger" ? <TriangleAlert className="h-4 w-4" strokeWidth={1.75} /> : <Info className="h-4 w-4" strokeWidth={1.75} />}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium leading-snug">{n.title}</p>
                            <p className="truncate text-xs text-muted" title={n.message}>
                              {n.status === "failed" && n.error ? n.error : n.message}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex w-fit items-center rounded bg-surface-hover px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-muted">
                          {isTest ? "Test" : EVENT_LABEL[n.event] ?? n.event}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">
                        <span className="inline-flex items-center gap-1.5">
                          <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                          {n.channelName}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex w-fit items-center rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider",
                            n.status === "sent" ? "bg-success/15 text-success" : "bg-danger/15 text-danger",
                          )}
                        >
                          {n.status === "sent" ? "Delivered" : "Failed"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-xs text-muted">
                        <time dateTime={n.createdAt} title={new Date(n.createdAt).toLocaleString()}>
                          {timeAgo(n.createdAt)}
                        </time>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border bg-surface-hover px-4 py-3 text-xs text-muted">
            Showing {visibleItems.length} {visibleItems.length === 1 ? "message" : "messages"}
          </div>
        </div>
      )}

      {nextBefore ? (
        <button onClick={fetchOlder} disabled={loadingMore} className="mx-auto mt-4 flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-xs text-muted transition hover:bg-surface-hover hover:text-foreground disabled:opacity-60">
          {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Load older
        </button>
      ) : null}
    </div>
  );
}
