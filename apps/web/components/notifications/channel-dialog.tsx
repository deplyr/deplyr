"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Check, ExternalLink, Loader2, X } from "lucide-react";
import {
  NOTIFICATION_EVENTS,
  NOTIFICATION_EVENT_IDS,
  type NotificationChannelDTO,
  type NotificationEventId,
  type NotificationType,
  type ProjectSummary,
} from "@deplyr/shared-types";
import { Button } from "@/components/ui/button";
import { Field, FormError, inputClass } from "@/components/ui/field";
import { CHANNEL_META, EVENT_GROUPS } from "@/components/notifications/channel-meta";
import { cn } from "@/lib/cn";
import { useOnOpen } from "@/lib/use-on-open";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Create a channel, or (when `channel` is given) edit one's name and events. */
export function ChannelDialog({
  open,
  channel,
  initialType,
  onClose,
  onSaved,
}: {
  open: boolean;
  channel?: NotificationChannelDTO | null;
  initialType?: NotificationType;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = Boolean(channel);
  const [type, setType] = useState<NotificationType>("discord");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<Set<NotificationEventId>>(new Set(NOTIFICATION_EVENT_IDS));
  const [projectId, setProjectId] = useState("");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Only when it opens — the channel list refreshes and would erase typing.
  useOnOpen(open, () => {
    setError(null);
    setSaving(false);
    setUrl("");
    setProjectId("");
    setType(channel?.type ?? initialType ?? "discord");
    setName(channel?.name ?? "");
    setEvents(new Set(channel?.events ?? NOTIFICATION_EVENT_IDS));
    if (!channel) {
      fetch(`${API_URL}/projects`, { credentials: "include" })
        .then((r) => (r.ok ? r.json() : []))
        .then(setProjects)
        .catch(() => setProjects([]));
    }
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !saving && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, saving]);

  if (!open) return null;

  const meta = CHANNEL_META[type];
  const toggle = (id: NotificationEventId) =>
    setEvents((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(editing ? `${API_URL}/notifications/channels/${channel!.id}` : `${API_URL}/notifications/channels`, {
        method: editing ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editing
            ? { name, events: [...events], ...(url.trim() ? { webhookUrl: url.trim() } : {}) }
            : { type, name, webhookUrl: url, events: [...events], projectId: projectId || null },
        ),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "Something went wrong.");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto px-4 py-[5vh]" role="dialog" aria-modal="true" aria-label={editing ? "Edit channel" : "Connect a channel"}>
      <div className="fixed inset-0 animate-fade-up bg-black/60 backdrop-blur-sm" onClick={() => !saving && onClose()} />
      <div className="relative w-full max-w-xl animate-fade-up rounded-2xl border border-border bg-surface shadow-xl">
        <form onSubmit={submit} className="p-6 sm:p-8">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">{editing ? `Edit ${channel!.name}` : "Connect a channel"}</h2>
              <p className="mt-1 text-sm text-muted">{editing ? "Change what this channel hears about." : "Deplyr will send a test message to check it works."}</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted transition hover:bg-surface-hover hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {!editing ? (
            <div className="grid grid-cols-2 gap-3">
              {(Object.keys(CHANNEL_META) as NotificationType[]).map((t) => {
                const m = CHANNEL_META[t];
                const Icon = m.icon;
                const active = t === type;
                return (
                  <button
                    type="button"
                    key={t}
                    onClick={() => setType(t)}
                    className={cn("relative flex flex-col gap-2 rounded-xl border p-4 text-left transition", active ? "border-accent/60 bg-accent/10 ring-4 ring-accent/10" : "border-border bg-surface-hover hover:bg-surface")}
                  >
                    <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg", m.tile)}>
                      <Icon className="h-4 w-4" strokeWidth={1.75} />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">{m.label}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted">{m.blurb}</span>
                    </span>
                    {active ? <Check className="absolute right-3 top-3 h-4 w-4 text-accent" strokeWidth={2.5} /> : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="mt-6 space-y-5">
            <Field label="Name" hint="Just for you — e.g. “Team alerts” or “#ops”.">
              <input required value={name} onChange={(e) => setName(e.target.value)} placeholder={`${meta.label} alerts`} maxLength={60} className={inputClass} />
            </Field>

            <Field label="Webhook URL" hint={editing ? `Leave blank to keep the current one${channel?.hint ? ` (${channel.hint})` : ""}.` : undefined}>
              <input
                required={!editing}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={editing ? "Leave blank to keep the current webhook" : meta.placeholder}
                spellCheck={false}
                autoComplete="off"
                className={cn(inputClass, "font-mono text-xs")}
              />
            </Field>

            {!editing ? (
              <>
                <ol className="space-y-1.5 rounded-xl border border-border bg-surface-hover p-3.5 text-xs leading-relaxed text-muted">
                  <li className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
                    How to get a {meta.label} webhook
                    <ExternalLink className="h-3 w-3 text-muted" strokeWidth={1.75} />
                  </li>
                  {meta.steps.map((s, i) => (
                    <li key={s} className="flex gap-2">
                      <span className="font-mono text-accent">{i + 1}.</span>
                      {s}
                    </li>
                  ))}
                </ol>

                <Field label="Applies to">
                  <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={inputClass}>
                    <option value="">All projects</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        Only {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            ) : null}

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">Send me a message when…</span>
                <button type="button" onClick={() => setEvents(events.size === NOTIFICATION_EVENT_IDS.length ? new Set() : new Set(NOTIFICATION_EVENT_IDS))} className="text-xs text-muted transition hover:text-foreground">
                  {events.size === NOTIFICATION_EVENT_IDS.length ? "Clear all" : "Select all"}
                </button>
              </div>
              <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {EVENT_GROUPS.map((group) => (
                  <fieldset key={group}>
                    <legend className="mb-1 text-[10px] uppercase tracking-widest text-muted">{group}</legend>
                    {NOTIFICATION_EVENTS.filter((e) => e.group === group).map((e) => (
                      <label key={e.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1.5 text-sm transition hover:bg-surface-hover">
                        <input type="checkbox" checked={events.has(e.id)} onChange={() => toggle(e.id)} className="h-4 w-4 accent-accent" />
                        <span className={cn(events.has(e.id) ? "" : "text-muted")}>{e.label}</span>
                      </label>
                    ))}
                  </fieldset>
                ))}
              </div>
            </div>
          </div>

          {error ? (
            <div className="mt-5">
              <FormError>{error}</FormError>
            </div>
          ) : null}

          <div className="mt-6 flex items-center justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || events.size === 0}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? (editing ? "Saving…" : "Sending a test message…") : editing ? "Save changes" : "Connect & send test"}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
