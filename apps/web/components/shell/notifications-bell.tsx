"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Siren } from "lucide-react";
import type { ActivityEvent, AppHealthRow, OverviewSummary } from "@deplyr/shared-types";
import { activityIcons, activityTones } from "@/components/dashboard/activity-meta";
import { timeAgo } from "@/lib/time-ago";
import { cn } from "@/lib/cn";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const SEEN_KEY = "deplyr_notifications_seen_at";
const REFRESH_MS = 60_000;

function readSeen(): number {
  try {
    return Number(localStorage.getItem(SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function NotificationsBell() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [down, setDown] = useState<AppHealthRow[]>([]);
  const [seenAt, setSeenAt] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/overview`, { credentials: "include" });
      if (res.ok) {
        const body = (await res.json()) as OverviewSummary;
        setEvents(body.events);
        setDown(body.health.filter((h) => h.status === "unhealthy"));
      }
    } catch {
      /* offline — keep whatever we had */
    }
  }, []);

  useEffect(() => {
    setSeenAt(readSeen());
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Only things that need a human count toward the badge — a successful
  // deploy isn't a reason to pull someone's attention.
  // A down app stays "unread" until it recovers, however often you look —
  // dismissing the badge shouldn't hide an ongoing outage.
  const unread =
    down.length +
    events.filter(
      (e) => (e.tone === "danger" || e.tone === "warning") && new Date(e.at).getTime() > seenAt,
    ).length;

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      load();
      const now = Date.now();
      try {
        localStorage.setItem(SEEN_KEY, String(now));
      } catch {
        /* private mode — badge just won't persist */
      }
      // keep the badge visible for this open, clear it after
      setTimeout(() => setSeenAt(now), 400);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        aria-label="Notifications"
        className={cn(
          "relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-hover text-muted transition hover:bg-surface hover:text-foreground",
          open && "bg-surface text-foreground",
        )}
      >
        <Bell className="h-4 w-4" strokeWidth={1.75} />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-background">
            {unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-11 z-50 w-[22rem] max-w-[calc(100vw-2rem)] animate-fade-up overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-border bg-surface-hover px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            <span className="text-[10px] uppercase tracking-widest text-muted">latest</span>
          </div>
          {events.length === 0 && down.length === 0 ? (
            <p className="px-4 py-10 text-center text-xs text-muted">You&apos;re all caught up.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto p-2">
              {down.map((d) => (
                <li key={`down-${d.projectId}`}>
                  <Link href={`/projects/${d.projectId}`} onClick={() => setOpen(false)}>
                    <div className="flex items-start gap-3 rounded-lg border border-danger/20 bg-danger/[0.06] px-2 py-2.5 transition hover:bg-danger/10">
                      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1", activityTones.danger)}>
                        <Siren className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{d.name} is down</p>
                        <p className="truncate text-xs text-muted">Checked {timeAgo(d.lastCheckedAt)}</p>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
              {events.slice(0, 8).map((e) => {
                const Icon = activityIcons[e.kind];
                const item = (
                  <div className="flex items-start gap-3 rounded-lg px-2 py-2.5 transition hover:bg-surface-hover">
                    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1", activityTones[e.tone])}>
                      <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{e.title}</p>
                      <p className="truncate text-xs text-muted">
                        {e.detail ? `${e.detail} · ` : ""}
                        {timeAgo(e.at)}
                      </p>
                    </div>
                  </div>
                );
                return (
                  <li key={e.id}>
                    {e.href ? (
                      <Link href={e.href} onClick={() => setOpen(false)}>
                        {item}
                      </Link>
                    ) : (
                      item
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <Link
            href="/activity"
            onClick={() => setOpen(false)}
            className="block border-t border-border bg-surface-hover px-4 py-2.5 text-center text-xs font-medium text-muted transition hover:text-foreground"
          >
            See all activity
          </Link>
        </div>
      ) : null}
    </div>
  );
}
