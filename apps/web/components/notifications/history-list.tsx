"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, History, Info, Loader2, TriangleAlert } from "lucide-react";
import type { NotificationChannelDTO, NotificationHistoryDTO, NotificationHistoryPage } from "@deplyr/shared-types";
import { CHANNEL_META, EVENT_LABEL, LEVEL_STYLE } from "@/components/notifications/channel-meta";
import { GlassCard } from "@/components/ui/glass-card";
import { SectionTitle } from "@/components/ui/section-title";
import { timeAgo } from "@/lib/time-ago";
import { cn } from "@/lib/cn";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const PAGE_SIZE = 15;
const REFRESH_MS = 15_000;

type StatusFilter = "all" | "sent" | "failed";

export function HistoryList({ channels, refreshKey }: { channels: NotificationChannelDTO[]; refreshKey: number }) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [channelId, setChannelId] = useState("");
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

  return (
    <GlassCard className="animate-fade-up" style={{ animationDelay: "120ms" }} innerClassName="p-6">
      <SectionTitle icon={History} meta="every message Deplyr has tried to send">
        History
      </SectionTitle>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["all", "sent", "failed"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={cn("rounded-full border px-3 py-1 text-xs font-medium capitalize transition", status === s ? "border-accent/50 bg-accent/15 text-accent" : "border-white/10 text-muted hover:bg-white/[0.05] hover:text-foreground")}
          >
            {s === "all" ? "All" : s === "sent" ? "Delivered" : "Failed"}
          </button>
        ))}
        {channels.length > 1 ? (
          <select value={channelId} onChange={(e) => setChannelId(e.target.value)} aria-label="Filter by channel" className="ml-auto rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-muted focus:border-accent/60 focus:outline-none">
            <option value="">All channels</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {failed && !latest ? (
        <p className="py-10 text-center text-sm text-muted">Couldn&apos;t load history. It will retry shortly.</p>
      ) : latest === null ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-white/[0.04]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <History className="h-5 w-5" strokeWidth={1.5} />
          </span>
          <p className="mt-3 text-sm font-medium">{status === "all" && !channelId ? "Nothing sent yet" : "No messages match"}</p>
          <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted">
            {status === "all" && !channelId ? "When an app goes down, a deploy finishes or a server drops, it shows up here — along with whether it was delivered." : "Try a different filter."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-white/[0.06]">
          {items.map((n) => {
            const meta = CHANNEL_META[n.channelType];
            const Icon = meta.icon;
            const isTest = n.event === "test";
            return (
              <li key={n.id} className="flex items-start gap-4 py-3.5">
                {/* The icon says what HAPPENED (red = bad news); the pill on the right says whether we DELIVERED it. */}
                <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1", isTest || n.level === "info" ? "bg-white/[0.05] text-muted ring-white/10" : n.level === "critical" ? "bg-danger/10 text-danger ring-danger/25" : "bg-success/10 text-success ring-success/25")}>
                  {isTest || n.level === "info" ? <Info className="h-4 w-4" strokeWidth={1.75} /> : n.level === "critical" ? <TriangleAlert className="h-4 w-4" strokeWidth={1.75} /> : <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="text-sm font-medium">{n.title}</p>
                    <span className={cn("rounded-full border px-2 py-px text-[10px] font-medium", isTest ? LEVEL_STYLE.info : LEVEL_STYLE[n.level])}>{isTest ? "Test" : EVENT_LABEL[n.event] ?? n.event}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted">{n.message}</p>
                  {n.status === "failed" && n.error ? (
                    <p className="mt-1 text-xs text-danger">
                      {n.error}
                      {n.attempts > 1 ? ` (tried ${n.attempts} times)` : ""}
                    </p>
                  ) : null}
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
                    <span className="inline-flex items-center gap-1">
                      <Icon className="h-3 w-3" strokeWidth={1.75} />
                      {n.channelName}
                    </span>
                    {n.projectName ? <span>· {n.projectName}</span> : null}
                    {n.serverName ? <span>· {n.serverName}</span> : null}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
                  <time className="text-xs text-muted" dateTime={n.createdAt} title={new Date(n.createdAt).toLocaleString()}>
                    {timeAgo(n.createdAt)}
                  </time>
                  <span className={cn("rounded-full border px-2 py-px text-[10px] font-medium", n.status === "sent" ? "border-success/25 bg-success/10 text-success" : "border-danger/25 bg-danger/10 text-danger")}>
                    {n.status === "sent" ? "Delivered" : "Failed"}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {nextBefore ? (
        <button onClick={fetchOlder} disabled={loadingMore} className="mx-auto mt-4 flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-xs text-muted transition hover:bg-white/[0.05] hover:text-foreground disabled:opacity-60">
          {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Load older
        </button>
      ) : null}
    </GlassCard>
  );
}
