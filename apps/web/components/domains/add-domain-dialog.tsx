"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Check, Globe, Loader2, X } from "lucide-react";
import { checkHostnameFormat, type DomainDTO } from "@deplyr/shared-types";
import { Button } from "@/components/ui/button";
import { FormError, inputClass } from "@/components/ui/field";
import { cn } from "@/lib/cn";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN ?? "deplyr.app";

export function AddDomainDialog({
  projectId,
  open,
  onClose,
  onAdded,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onAdded: (domain: DomainDTO) => void;
}) {
  const [hostname, setHostname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setHostname("");
    setError(null);
    setSaving(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !saving && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, saving]);

  if (!open) return null;

  // Client-side check is the same pure function the API uses — instant
  // feedback, but the API re-checks regardless, so this is only a UX nicety.
  const trimmed = hostname.trim();
  const preview = trimmed ? checkHostnameFormat(trimmed, APP_DOMAIN) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/projects/${projectId}/domains`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostname: trimmed }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "Couldn't add that domain.");
        return;
      }
      onAdded(body as DomainDTO);
      onClose();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto px-4 py-[8vh]" role="dialog" aria-modal="true" aria-label="Add a domain">
      <div className="fixed inset-0 animate-fade-up bg-black/60 backdrop-blur-sm" onClick={() => !saving && onClose()} />
      <div className="relative w-full max-w-md animate-fade-up rounded-3xl bg-gradient-to-b from-white/25 to-white/[0.04] p-px shadow-2xl shadow-black/70">
        <form onSubmit={submit} className="rounded-[calc(1.5rem-1px)] bg-[#0c0c10]/95 p-6 backdrop-blur-xl sm:p-8">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h2 className="font-mono text-xl font-semibold tracking-tight">Add a domain</h2>
              <p className="mt-1 text-sm text-muted">Point your own domain at this project. You&apos;ll get a DNS record to add next.</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted transition hover:bg-white/[0.06] hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="relative">
            <Globe className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={1.75} />
            <input
              autoFocus
              required
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              placeholder="app.example.com"
              spellCheck={false}
              autoComplete="off"
              className={cn(inputClass, "pl-10 font-mono text-sm")}
            />
          </div>
          {preview && !preview.ok ? <p className="mt-2 text-xs text-danger">{preview.error}</p> : null}
          {preview?.ok ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-success">
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
              Looks like a valid domain.
            </p>
          ) : null}

          {error ? (
            <div className="mt-4">
              <FormError>{error}</FormError>
            </div>
          ) : null}

          <div className="mt-6 flex items-center justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !preview?.ok}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? "Adding…" : "Add domain"}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
