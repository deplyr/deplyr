"use client";

import { useState } from "react";
import { AlertCircle, Check, Loader2, Pencil, Send, Trash2 } from "lucide-react";
import type { NotificationChannelDTO } from "@deplyr/shared-types";
import { CHANNEL_META, EVENT_LABEL } from "@/components/notifications/channel-meta";
import { GlassCard } from "@/components/ui/glass-card";
import { timeAgo } from "@/lib/time-ago";
import { cn } from "@/lib/cn";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const SHOWN_EVENTS = 3;

export function ChannelCard({
  channel,
  onChanged,
  onEdit,
}: {
  channel: NotificationChannelDTO;
  onChanged: () => void;
  onEdit: () => void;
}) {
  const meta = CHANNEL_META[channel.type];
  const Icon = meta.icon;
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error: string | null } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    await fetch(`${API_URL}/notifications/channels/${channel.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !channel.enabled }),
    });
    setBusy(false);
    onChanged();
  }

  async function sendTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${API_URL}/notifications/channels/${channel.id}/test`, { method: "POST", credentials: "include" });
      setTestResult(await res.json());
    } catch {
      setTestResult({ ok: false, error: "Couldn't reach the server." });
    } finally {
      setTesting(false);
      onChanged();
    }
  }

  async function remove() {
    setBusy(true);
    await fetch(`${API_URL}/notifications/channels/${channel.id}`, { method: "DELETE", credentials: "include" });
    onChanged();
  }

  const shown = channel.events.slice(0, SHOWN_EVENTS);
  const more = channel.events.length - shown.length;
  const last = channel.lastDelivery;

  return (
    <GlassCard innerClassName={cn("flex h-full flex-col p-5 transition", !channel.enabled && "opacity-60")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", meta.tile)}>
            <Icon className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{channel.name}</p>
            <p className="truncate font-mono text-[11px] text-muted">
              {meta.label} · {channel.hint ?? "•••"}
            </p>
          </div>
        </div>

        <button
          role="switch"
          aria-checked={channel.enabled}
          aria-label={channel.enabled ? "Pause this channel" : "Resume this channel"}
          onClick={toggle}
          disabled={busy}
          className={cn("relative h-6 w-10 shrink-0 rounded-full border transition", channel.enabled ? "border-accent/40 bg-accent/30" : "border-white/10 bg-white/[0.06]")}
        >
          <span className={cn("absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow transition-all", channel.enabled ? "left-[1.15rem]" : "left-0.5")} style={{ height: "1.125rem", width: "1.125rem" }} />
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[11px] text-muted">{channel.projectName ? `Only ${channel.projectName}` : "All projects"}</span>
        {shown.map((e) => (
          <span key={e} className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-muted">
            {EVENT_LABEL[e] ?? e}
          </span>
        ))}
        {more > 0 ? <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-muted">+{more} more</span> : null}
      </div>

      <div className="mt-4 flex-1">
        {testResult ? (
          <p className={cn("flex items-start gap-1.5 text-xs leading-relaxed", testResult.ok ? "text-success" : "text-danger")}>
            {testResult.ok ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.5} /> : <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />}
            {testResult.ok ? "Test message delivered." : testResult.error}
          </p>
        ) : last ? (
          <p className={cn("flex items-start gap-1.5 text-xs leading-relaxed", last.status === "sent" ? "text-muted" : "text-danger")}>
            {last.status === "sent" ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" strokeWidth={2.5} /> : <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />}
            {last.status === "sent" ? `Last delivered ${timeAgo(last.at)}` : `Last attempt failed ${timeAgo(last.at)}${last.error ? ` — ${last.error}` : ""}`}
          </p>
        ) : (
          <p className="text-xs text-muted">Nothing sent yet.</p>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-white/[0.07] pt-4">
        {confirmDelete ? (
          <>
            <span className="mr-auto text-xs text-muted">Remove this channel?</span>
            <button onClick={() => setConfirmDelete(false)} className="rounded-lg px-2.5 py-1.5 text-xs text-muted transition hover:bg-white/[0.06] hover:text-foreground">
              Keep
            </button>
            <button onClick={remove} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-danger/15 px-2.5 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/25">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />}
              Remove
            </button>
          </>
        ) : (
          <>
            <button onClick={sendTest} disabled={testing} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-muted transition hover:bg-white/[0.06] hover:text-foreground disabled:opacity-60">
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" strokeWidth={1.75} />}
              Send test
            </button>
            <button onClick={onEdit} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted transition hover:bg-white/[0.06] hover:text-foreground">
              <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
              Edit
            </button>
            <button onClick={() => setConfirmDelete(true)} aria-label="Remove channel" className="ml-auto rounded-lg p-1.5 text-muted transition hover:bg-danger/10 hover:text-danger">
              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </>
        )}
      </div>
    </GlassCard>
  );
}
