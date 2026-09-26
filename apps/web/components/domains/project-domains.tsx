"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Globe,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Unlock,
} from "lucide-react";
import type { DefaultDomainDTO, DomainDTO } from "@deplyr/shared-types";
import { AddDomainDialog } from "@/components/domains/add-domain-dialog";
import { FlatCard } from "@/components/ui/flat-card";
import { CopyButton } from "@/components/ui/copy-button";
import { SectionTitle } from "@/components/ui/section-title";
import { timeAgo } from "@/lib/time-ago";
import { cn } from "@/lib/cn";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const POLL_MS = 5_000;

interface Payload {
  default: DefaultDomainDTO;
  domains: DomainDTO[];
}

const STATUS_META: Record<DomainDTO["status"], { label: string; tone: "success" | "warning" | "danger" | "neutral"; pulse?: boolean }> = {
  pending_dns: { label: "Waiting on DNS", tone: "warning", pulse: true },
  provisioning: { label: "Setting up", tone: "warning", pulse: true },
  active: { label: "Live", tone: "success" },
  error: { label: "Error", tone: "danger" },
  removing: { label: "Removing", tone: "neutral", pulse: true },
};

const toneClass = { success: "border-success/25 bg-success/10 text-success", warning: "border-warning/25 bg-warning/10 text-warning", danger: "border-danger/25 bg-danger/10 text-danger", neutral: "border-border bg-surface-hover text-muted" };

function StatusPill({ status }: { status: DomainDTO["status"] }) {
  const m = STATUS_META[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", toneClass[m.tone])}>
      <span className="relative flex h-1.5 w-1.5">
        {m.pulse ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" /> : null}
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
      </span>
      {m.label}
    </span>
  );
}

function DnsCard({ domain }: { domain: DomainDTO }) {
  return (
    <div className="mt-4 rounded-xl border border-warning/20 bg-warning/[0.04] p-4">
      <p className="mb-3 text-xs leading-relaxed text-foreground">{domain.statusDetail ?? "Add this DNS record with your domain registrar, then it'll pick up automatically."}</p>
      <div className="grid grid-cols-[3rem_1fr_1fr] gap-x-4 gap-y-1 font-mono text-xs">
        <span className="text-muted">Type</span>
        <span className="text-muted">Host</span>
        <span className="text-muted">Value</span>
        <span className="font-semibold">{domain.dns.type}</span>
        <span className="truncate">{domain.dns.host}</span>
        <span className="flex min-w-0 items-center gap-1">
          <span className="truncate">{domain.dns.value}</span>
          <CopyButton value={domain.dns.value} label="DNS value" />
        </span>
      </div>
      <p className="mt-3 text-[11px] text-muted">DNS changes can take a few minutes to a few hours to take effect. This checks automatically every couple of minutes.</p>
    </div>
  );
}

function DomainCard({ domain, onVerify, onDelete, verifying, deleting }: { domain: DomainDTO; onVerify: () => void; onDelete: () => void; verifying: boolean; deleting: boolean }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <FlatCard className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Globe className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <a href={`http://${domain.hostname}`} target="_blank" rel="noreferrer" className="truncate font-mono text-sm font-semibold hover:underline">
              {domain.hostname}
            </a>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
              {domain.sslStatus === "active" ? <Lock className="h-3 w-3 text-success" strokeWidth={1.75} /> : <Unlock className="h-3 w-3" strokeWidth={1.75} />}
              {domain.sslStatus === "active" && domain.certExpiresAt
                ? `HTTPS · certificate renews ${timeAgo(domain.certExpiresAt)}`
                : domain.sslStatus === "provisioning"
                  ? "Requesting a certificate…"
                  : domain.sslStatus === "error"
                    ? "HTTP only — certificate failed"
                    : "HTTP only"}
            </p>
          </div>
        </div>
        <StatusPill status={domain.status} />
      </div>

      {domain.status === "pending_dns" ? <DnsCard domain={domain} /> : null}

      {domain.status === "error" && domain.statusDetail ? (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-danger/20 bg-danger/[0.05] p-3 text-xs leading-relaxed text-danger">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          {domain.statusDetail}
        </p>
      ) : null}

      {domain.sslStatus === "error" && domain.sslStatusDetail ? (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-warning/20 bg-warning/[0.05] p-3 text-xs leading-relaxed text-warning">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          {domain.sslStatusDetail}
        </p>
      ) : null}

      <div className="mt-4 flex items-center gap-2 border-t border-border pt-4">
        {domain.lastCheckedAt ? (
          <span className="mr-auto flex items-center gap-1.5 text-[11px] text-muted">
            <Clock className="h-3 w-3" strokeWidth={1.75} />
            checked {timeAgo(domain.lastCheckedAt)}
          </span>
        ) : (
          <span className="mr-auto" />
        )}
        {confirming ? (
          <>
            <span className="text-xs text-muted">Remove this domain?</span>
            <button onClick={() => setConfirming(false)} className="rounded-lg px-2.5 py-1.5 text-xs text-muted transition hover:bg-surface-hover hover:text-foreground">
              Keep
            </button>
            <button onClick={onDelete} disabled={deleting} className="inline-flex items-center gap-1.5 rounded-lg bg-danger/15 px-2.5 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/25">
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />}
              Remove
            </button>
          </>
        ) : (
          <>
            {domain.status === "pending_dns" || domain.status === "error" || domain.sslStatus === "error" ? (
              <button onClick={onVerify} disabled={verifying || domain.status === "removing"} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted transition hover:bg-surface-hover hover:text-foreground disabled:opacity-60">
                {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />}
                {domain.status === "pending_dns" ? "Check now" : "Retry"}
              </button>
            ) : null}
            <button onClick={() => setConfirming(true)} disabled={domain.status === "removing"} aria-label="Remove domain" className="rounded-lg p-1.5 text-muted transition hover:bg-danger/10 hover:text-danger disabled:opacity-60">
              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </>
        )}
      </div>
    </FlatCard>
  );
}

export function ProjectDomains({ projectId }: { projectId: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState<{ id: string; kind: "verify" | "delete" } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/projects/${projectId}/domains`, { credentials: "include" });
      if (res.ok) setData(await res.json());
    } catch {
      /* keep what we have */
    }
  }, [projectId]);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  async function verify(id: string) {
    setBusy({ id, kind: "verify" });
    await fetch(`${API_URL}/projects/${projectId}/domains/${id}/verify`, { method: "POST", credentials: "include" });
    await load();
    setBusy(null);
  }

  async function remove(id: string) {
    setBusy({ id, kind: "delete" });
    await fetch(`${API_URL}/projects/${projectId}/domains/${id}`, { method: "DELETE", credentials: "include" });
    await load();
    setBusy(null);
  }

  return (
    <div className="space-y-6">
      <FlatCard className="animate-fade-up p-6">
        <SectionTitle icon={Globe} meta="always on">
          Default address
        </SectionTitle>
        {data === null ? (
          <div className="h-14 animate-pulse rounded-xl bg-surface-hover" />
        ) : (
          <div className="flex items-center gap-4 rounded-xl border border-border bg-surface-hover p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
              {data.default.https ? <Lock className="h-4 w-4" strokeWidth={1.75} /> : <Unlock className="h-4 w-4" strokeWidth={1.75} />}
            </span>
            <div className="min-w-0 flex-1">
              <a href={`http${data.default.https ? "s" : ""}://${data.default.hostname}`} target="_blank" rel="noreferrer" className="truncate font-mono text-sm font-semibold hover:underline">
                {data.default.hostname}
              </a>
              <p className="mt-0.5 text-xs text-muted">
                {data.default.https ? "HTTPS is on" : "HTTP only — no wildcard certificate is configured on this control plane"}
                {data.default.checkedAt ? ` · checked ${timeAgo(data.default.checkedAt)}` : ""}
              </p>
            </div>
            <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", data.default.https ? "border-success/25 bg-success/10 text-success" : "border-border bg-surface-hover text-muted")}>
              {data.default.https ? <CheckCircle2 className="h-3 w-3" strokeWidth={2} /> : null}
              {data.default.https ? "HTTPS" : "HTTP"}
            </span>
          </div>
        )}
        <p className="mt-3 text-xs leading-relaxed text-muted">Every project gets this address free, forever. Add your own domain below if you want one.</p>
      </FlatCard>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-widest text-muted">Custom domains{data ? ` · ${data.domains.length}` : ""}</p>
          <button onClick={() => setDialogOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-xs text-muted transition hover:border-accent/50 hover:text-accent">
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            Add domain
          </button>
        </div>

        {data === null ? (
          <div className="h-24 animate-pulse rounded-xl bg-surface-hover" />
        ) : data.domains.length === 0 ? (
          <FlatCard className="flex flex-col items-center px-6 py-10 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <Globe className="h-5 w-5" strokeWidth={1.5} />
            </span>
            <p className="mt-3 text-sm font-medium">No custom domains</p>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted">Point your own domain here — Deplyr verifies the DNS and gets a free certificate for it automatically.</p>
            <button onClick={() => setDialogOpen(true)} className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground transition hover:brightness-110">
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              Add your first domain
            </button>
          </FlatCard>
        ) : (
          <div className="space-y-4">
            {data.domains.map((d) => (
              <DomainCard
                key={d.id}
                domain={d}
                onVerify={() => verify(d.id)}
                onDelete={() => remove(d.id)}
                verifying={busy?.id === d.id && busy.kind === "verify"}
                deleting={busy?.id === d.id && busy.kind === "delete"}
              />
            ))}
          </div>
        )}
      </div>

      <AddDomainDialog projectId={projectId} open={dialogOpen} onClose={() => setDialogOpen(false)} onAdded={() => load()} />
    </div>
  );
}
