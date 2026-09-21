"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, Plus } from "lucide-react";
import type { NotificationChannelDTO, NotificationType } from "@deplyr/shared-types";
import { ChannelCard } from "@/components/notifications/channel-card";
import { ChannelDialog } from "@/components/notifications/channel-dialog";
import { CHANNEL_META } from "@/components/notifications/channel-meta";
import { HistoryList } from "@/components/notifications/history-list";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Page, PageHeader } from "@/components/ui/page";
import { cn } from "@/lib/cn";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function NotificationsPage() {
  const [channels, setChannels] = useState<NotificationChannelDTO[] | null>(null);
  const [dialog, setDialog] = useState<{ open: boolean; channel?: NotificationChannelDTO | null; type?: NotificationType }>({ open: false });
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/notifications/channels`, { credentials: "include" });
      if (res.ok) setChannels(await res.json());
    } catch {
      /* keep what we have */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const changed = useCallback(() => {
    load();
    setRefreshKey((k) => k + 1);
  }, [load]);

  const empty = channels !== null && channels.length === 0;

  return (
    <Page>
      <PageHeader
        eyebrow="Notifications"
        title="Where alerts go"
        description="Get told in Discord or Slack when an app goes down, a deploy finishes, or a server drops off — and see exactly what was sent."
        actions={
          channels && channels.length > 0 ? (
            <Button onClick={() => setDialog({ open: true })}>
              <Plus className="h-4 w-4" strokeWidth={2} />
              Add channel
            </Button>
          ) : null
        }
      />

      {channels === null ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-48 animate-pulse rounded-2xl bg-white/[0.04]" />
          <div className="h-48 animate-pulse rounded-2xl bg-white/[0.04]" />
        </div>
      ) : empty ? (
        <GlassCard className="animate-fade-up" innerClassName="relative overflow-hidden p-8 sm:p-10">
          <div className="pointer-events-none absolute left-1/2 top-0 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/20 blur-[80px]" />
          <div className="relative mx-auto max-w-2xl text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-accent shadow-lg shadow-accent/10">
              <BellRing className="h-6 w-6" strokeWidth={1.5} />
            </span>
            <h2 className="mt-5 font-mono text-lg font-semibold">Connect a channel to get alerts</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
              Pick where Deplyr should post. It takes about a minute, and we send a test message so you know it works.
            </p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {(Object.keys(CHANNEL_META) as NotificationType[]).map((t) => {
                const m = CHANNEL_META[t];
                const Icon = m.icon;
                return (
                  <button
                    key={t}
                    onClick={() => setDialog({ open: true, type: t })}
                    className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-accent/40 hover:bg-white/[0.06]"
                  >
                    <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl", m.tile)}>
                      <Icon className="h-5 w-5" strokeWidth={1.75} />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">Connect {m.label}</span>
                      <span className="mt-0.5 block text-xs text-muted">{m.blurb}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </GlassCard>
      ) : (
        <div className="grid animate-fade-up gap-4 md:grid-cols-2 xl:grid-cols-3">
          {channels.map((c) => (
            <ChannelCard key={c.id} channel={c} onChanged={changed} onEdit={() => setDialog({ open: true, channel: c })} />
          ))}
        </div>
      )}

      <HistoryList channels={channels ?? []} refreshKey={refreshKey} />

      <ChannelDialog open={dialog.open} channel={dialog.channel} initialType={dialog.type} onClose={() => setDialog({ open: false })} onSaved={changed} />
    </Page>
  );
}
