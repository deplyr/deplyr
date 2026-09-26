"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, Check, ExternalLink, Globe, Loader2 } from "lucide-react";
import type { InstanceDomainCheck, InstanceSettingsDTO } from "@deplyr/shared-types";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { FormError, inputClass } from "@/components/ui/field";
import { SectionTitle } from "@/components/ui/section-title";
import { cn } from "@/lib/cn";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const POLL_MS = 5000;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** What to type into a DNS provider: the host label ("deplyr" for
 * deplyr.example.com, "@" for the bare domain itself). Doesn't know about
 * multi-part public suffixes like co.uk — the full name is shown too. */
function recordHost(domain: string): string {
  const labels = domain.split(".");
  return labels.length <= 2 ? "@" : labels.slice(0, -2).join(".");
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">{n}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <div className="mt-2 space-y-3 text-sm leading-relaxed text-muted">{children}</div>
      </div>
    </li>
  );
}

function DnsRecord({ type, host, value, fullName }: { type: string; host: string; value: string; fullName: string }) {
  const rows: Array<{ label: string; value: string; copy?: boolean }> = [
    { label: "Type", value: type, copy: true },
    { label: "Name / Host", value: host, copy: true },
    { label: "Value / Points to", value, copy: true },
    { label: "TTL", value: "Auto (or 300)" },
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <dl className="divide-y divide-border">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3 bg-surface-hover px-4 py-2.5">
            <dt className="text-xs text-muted">{r.label}</dt>
            <dd className="flex min-w-0 items-center gap-1 font-mono text-xs text-foreground">
              <span className="truncate">{r.value}</span>
              {r.copy ? <CopyButton value={r.value} label={r.label} /> : null}
            </dd>
          </div>
        ))}
      </dl>
      <p className="border-t border-border bg-surface px-4 py-2 text-[11px] text-muted">
        Some providers want the full name instead of just the host — that's <span className="font-mono text-foreground">{fullName}</span>.
      </p>
    </div>
  );
}

function StatusPanel({ domain, check }: { domain: string; check: InstanceDomainCheck | null }) {
  const state = check?.state ?? "waiting_dns";

  if (state === "active") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-success/25 bg-success/[0.06] p-4">
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" strokeWidth={2.5} />
        <div className="min-w-0 text-sm">
          <p className="font-medium">Live — HTTPS is on</p>
          <a href={`https://${domain}`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1.5 font-mono text-xs text-accent hover:underline">
            https://{domain}
            <ExternalLink className="h-3 w-3" strokeWidth={1.75} />
          </a>
        </div>
      </div>
    );
  }

  if (state === "wrong_dns") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-warning/25 bg-warning/[0.06] p-4">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" strokeWidth={1.75} />
        <div className="min-w-0 text-sm leading-relaxed">
          <p className="font-medium">Your domain points somewhere else</p>
          <p className="mt-1 text-muted">
            <span className="font-mono text-foreground">{domain}</span> currently resolves to{" "}
            <span className="font-mono text-foreground">{check?.resolvedIps.join(", ")}</span>, but it should point to{" "}
            <span className="font-mono text-foreground">{check?.expectedIps.join(", ")}</span>. Update the record from step 1
            (delete any old A record for it). On Cloudflare, also switch the cloud icon to <strong className="text-foreground">DNS only (grey)</strong>.
          </p>
          <p className="mt-2 text-xs text-muted">Checking again every few seconds — this updates by itself.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-hover p-4">
      <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-accent" />
      <div className="min-w-0 text-sm leading-relaxed">
        {state === "waiting_dns" ? (
          <>
            <p className="font-medium">Fetching your domain's status…</p>
            <p className="mt-1 text-muted">
              We can't see the DNS record yet. Once you've added it, this usually flips within 2–3 minutes — sometimes up to an
              hour, depending on your DNS provider. You can leave this page open; it checks every few seconds and updates itself.
            </p>
          </>
        ) : (
          <>
            <p className="font-medium">DNS found — issuing your HTTPS certificate…</p>
            <p className="mt-1 text-muted">
              This normally takes under a minute. If it's still here after 5 minutes, check that ports <span className="font-mono text-foreground">80</span> and <span className="font-mono text-foreground">443</span> are open to the
              internet in your server's firewall or cloud security group — the certificate can't be issued without them.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

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

  const refresh = useCallback(async (first = false) => {
    try {
      const res = await fetch(`${API_URL}/instance`, { credentials: "include" });
      if (!res.ok) return;
      const d: InstanceSettingsDTO = await res.json();
      setData(d);
      if (first) setHostname(d.customDomain ?? "");
    } catch {
      /* keep what we have; the next tick retries */
    }
  }, []);

  useEffect(() => {
    refresh(true);
  }, [refresh]);

  // Poll while a saved domain isn't live yet. DNS and certificates finish on
  // their own schedule, not ours — this is what turns "wait a few minutes"
  // into the panel flipping green without a reload.
  const waiting = Boolean(data?.customDomain) && data?.domainStatus !== "error" && data?.check?.state !== "active";
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, refresh]);

  async function put(next: string) {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/instance/domain`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostname: next }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "Couldn't apply that.");
        return;
      }
      setData(body);
      setHostname(body.customDomain ?? "");
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setSaving(false);
    }
  }

  function save(e: FormEvent) {
    e.preventDefault();
    put(hostname.trim());
  }

  if (!data) {
    return (
      <>
        <SectionTitle icon={Globe}>Instance address</SectionTitle>
        <div className="h-24 animate-pulse rounded-xl bg-surface-hover" />
      </>
    );
  }

  const typed = hostname.trim().toLowerCase();
  const shownDomain = typed || data.customDomain || "";
  const isIp = IPV4.test(data.publicHost);
  const exampleName = shownDomain || "deplyr.yourdomain.com";

  return (
    <>
      <SectionTitle icon={Globe}>Instance address</SectionTitle>
      <p className="mb-5 text-sm leading-relaxed text-muted">
        Where this Deplyr instance itself is reached — not a project's address. The server address below always works,
        over plain HTTP. Add your own domain on top of it for a proper HTTPS address; the certificate is issued and renewed
        automatically.
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

      {data.publicHost ? (
        <ol className="mt-6 space-y-6">
          <Step n={1} title="Add this DNS record at your domain provider">
            <p>
              Log in to wherever you bought or manage the domain (Cloudflare, GoDaddy, Namecheap, Route 53, Google Domains…),
              open its <strong className="text-foreground">DNS settings</strong>, and create one new record with exactly these values:
            </p>
            <DnsRecord
              type={isIp ? "A" : "CNAME"}
              host={recordHost(exampleName)}
              value={data.publicHost}
              fullName={exampleName}
            />
            <p className="text-xs">
              Using Cloudflare? Set the proxy status to <strong className="text-foreground">DNS only (grey cloud)</strong> — the
              orange proxied mode stops the certificate from being issued.
            </p>
          </Step>

          <Step n={2} title="Enter the domain here">
            <form onSubmit={save} className="flex flex-col gap-2 sm:flex-row">
              <input
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                placeholder="deplyr.yourdomain.com"
                spellCheck={false}
                autoComplete="off"
                className={cn(inputClass, "font-mono text-xs")}
              />
              <Button type="submit" variant="secondary" disabled={saving} className="shrink-0">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {data.customDomain ? "Update" : "Add domain"}
              </Button>
            </form>
            {data.customDomain ? (
              <button onClick={() => put("")} disabled={saving} className="text-xs text-muted transition hover:text-danger disabled:opacity-60">
                Remove this domain
              </button>
            ) : null}
            {error ? <FormError>{error}</FormError> : null}
            {data.domainStatus === "error" && data.domainStatusDetail ? <FormError>{data.domainStatusDetail}</FormError> : null}
          </Step>

          <Step n={3} title="Wait for it to go live">
            {data.customDomain && data.domainStatus !== "error" ? (
              <StatusPanel domain={data.customDomain} check={data.check} />
            ) : (
              <p>After you add the domain, its status shows up here and updates by itself — no need to refresh.</p>
            )}
          </Step>
        </ol>
      ) : null}
    </>
  );
}
