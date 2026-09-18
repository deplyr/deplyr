"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import type { NotificationChannelSummary } from "@argo/shared-types";
import { Button } from "@/components/ui/button";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const inputClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none";

export function NotificationCard({
  projectId,
  initial,
}: {
  projectId: string;
  initial: NotificationChannelSummary;
}) {
  const [configured, setConfigured] = useState(initial.configured);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const res = await fetch(`${API_URL}/projects/${projectId}/channel`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webhookUrl }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Could not save this webhook URL.");
      setSaving(false);
      return;
    }

    setConfigured(true);
    setWebhookUrl("");
    setSaving(false);
  }

  return (
    <div className="rounded-lg border border-border bg-surface/40 p-5">
      <p className="text-sm font-medium text-foreground">Notifications</p>

      {configured ? (
        <div className="mt-2 flex items-center gap-2 text-sm text-foreground">
          <CheckCircle2 className="h-4 w-4 text-success" strokeWidth={1.75} />
          Slack connected
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-3 space-y-2">
          <p className="text-sm text-muted">
            Paste a Slack Incoming Webhook URL to get alerted if this app goes
            down.
          </p>
          <div className="flex gap-2">
            <input
              required
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://hooks.slack.com/services/..."
              className={inputClass}
            />
            <Button type="submit" variant="secondary" disabled={saving}>
              {saving ? "Saving..." : "Connect"}
            </Button>
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </form>
      )}
    </div>
  );
}
