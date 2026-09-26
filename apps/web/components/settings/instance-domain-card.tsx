"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Check, ExternalLink, Globe, Loader2, X } from "lucide-react";
import type { InstanceSettingsDTO } from "@deplyr/shared-types";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { FormError, inputClass } from "@/components/ui/field";
import { SectionTitle } from "@/components/ui/section-title";
import { cn } from "@/lib/cn";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Lets this instance's own address be changed from the dashboard instead of
 * SSH + editing .env + a rebuild — see apps/api/src/routes/instance.ts. The
 * bare host (DEPLYR_PUBLIC_HOST) always keeps working underneath; a custom
 * domain sits alongside it, not in place of it, so there's no way to lock
 * yourself out by pointing at a domain whose DNS isn't live yet.
 */
export function InstanceDomainCard() {
  const [data, setData] = useState<InstanceSettingsDTO | null>(null);
  const [hostname, setHostname] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/instance`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: InstanceSettingsDTO | null) => {
        if (d) {
          setData(d);
          setHostname(d.customDomain ?? "");
        }
      })
      .catch(() => {});
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/instance/domain`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostname: hostname.trim() }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "Couldn't apply that.");
        return;
      }
      setData(body);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setHostname("");
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/instance/domain`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostname: "" }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok) setData(body);
    } finally {
      setSaving(false);
    }
  }

  if (!data) {
    return (
      <>
        <SectionTitle icon={Globe}>Instance address</SectionTitle>
        <div className="h-24 animate-pulse rounded-xl bg-surface-hover" />
      </>
    );
  }

  return (
    <>
      <SectionTitle icon={Globe}>Instance address</SectionTitle>
      <p className="mb-5 text-sm leading-relaxed text-muted">
        Where this Deplyr instance itself is reached — not a project's address. The bare host below always works;
        add your own domain on top of it for a proper HTTPS address, with the certificate issued automatically.
      </p>

      {data.publicHost ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-hover px-4 py-3">
          <span className="min-w-0 truncate font-mono text-sm">{data.publicHost}</span>
          <div className="flex shrink-0 items-center gap-1">
            <span className="mr-1 text-xs text-muted">always on</span>
            <CopyButton value={data.publicHost} label="instance address" />
          </div>
        </div>
      ) : (
        <p className="rounded-xl border border-border bg-surface-hover px-4 py-3 text-sm text-muted">
          <code className="font-mono text-foreground">DEPLYR_PUBLIC_HOST</code> isn't set on this instance — expected in
          local dev, but a real self-hosted deploy sets this automatically (see infra/install.sh).
        </p>
      )}

      {data.customDomain ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-hover px-4 py-3">
          <a
            href={`https://${data.customDomain}`}
            target="_blank"
            rel="noreferrer"
            className="flex min-w-0 items-center gap-1.5 truncate font-mono text-sm text-accent hover:underline"
          >
            {data.customDomain}
            <ExternalLink className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          </a>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                data.domainStatus === "active" ? "border-success/25 bg-success/10 text-success" : "border-danger/25 bg-danger/10 text-danger",
              )}
            >
              {data.domainStatus === "active" ? <Check className="h-3 w-3" strokeWidth={2.5} /> : <X className="h-3 w-3" strokeWidth={2.5} />}
              {data.domainStatus === "active" ? "Active" : "Error"}
            </span>
            <button onClick={remove} disabled={saving} className="text-xs text-muted transition hover:text-danger disabled:opacity-60">
              Remove
            </button>
          </div>
        </div>
      ) : null}

      {data.domainStatus === "error" && data.domainStatusDetail ? (
        <p className="mt-2 text-xs text-danger">{data.domainStatusDetail}</p>
      ) : null}

      <form onSubmit={save} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={hostname}
          onChange={(e) => setHostname(e.target.value)}
          placeholder="deplyr.yourdomain.com"
          spellCheck={false}
          autoComplete="off"
          disabled={!data.publicHost}
          className={cn(inputClass, "font-mono text-xs")}
        />
        <Button type="submit" variant="secondary" disabled={saving || !data.publicHost} className="shrink-0">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {data.customDomain ? "Update" : "Add domain"}
        </Button>
      </form>
      {data.publicHost ? (
        <p className="mt-2 text-xs text-muted">
          Point the domain's DNS A record at <span className="font-mono text-foreground">{data.publicHost}</span> first — this
          works immediately after that, HTTPS usually within a minute.
        </p>
      ) : null}

      {error ? (
        <div className="mt-3">
          <FormError>{error}</FormError>
        </div>
      ) : null}
    </>
  );
}
