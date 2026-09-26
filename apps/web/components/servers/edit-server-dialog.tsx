"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import type { ServerSummary, SshCredentialType } from "@deplyr/shared-types";
import { Button } from "@/components/ui/button";
import { Field, FormError, inputClass } from "@/components/ui/field";
import { cn } from "@/lib/cn";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Renames a server, and/or fixes a wrong IP or SSH credential. The
 * credential field is left blank by default — submitting without touching
 * it keeps the one already on file, since it can't be shown back to you
 * (it's only ever stored encrypted). Filling in IP or credential re-runs
 * the install job, same as registering fresh — this is the supported way
 * to retry a server stuck in "error".
 */
export function EditServerDialog({
  server,
  open,
  onClose,
  onSaved,
}: {
  server: ServerSummary;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(server.name);
  const [ipAddress, setIpAddress] = useState(server.ipAddress);
  const [changeCredential, setChangeCredential] = useState(false);
  const [credentialType, setCredentialType] = useState<SshCredentialType>("password");
  const [credential, setCredential] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(server.name);
    setIpAddress(server.ipAddress);
    setChangeCredential(false);
    setCredentialType("password");
    setCredential("");
    setError(null);
    setSaving(false);
  }, [open, server]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !saving && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, saving]);

  if (!open) return null;

  const ipChanged = ipAddress.trim() !== server.ipAddress;
  const retrying = ipChanged || changeCredential;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const body: Record<string, string> = {};
      if (name.trim() !== server.name) body.name = name.trim();
      if (ipChanged) body.ipAddress = ipAddress.trim();
      if (changeCredential) {
        body.credentialType = credentialType;
        body.credential = credential;
      }
      if (Object.keys(body).length === 0) {
        onClose();
        return;
      }
      const res = await fetch(`${API_URL}/servers/${server.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const resBody = await res.json().catch(() => null);
      if (!res.ok) {
        setError(resBody?.error ?? "Couldn't save those changes.");
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
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto px-4 py-[8vh]" role="dialog" aria-modal="true" aria-label="Edit server">
      <div className="fixed inset-0 animate-fade-up bg-black/60 backdrop-blur-sm" onClick={() => !saving && onClose()} />
      <div className="relative w-full max-w-md animate-fade-up rounded-2xl border border-border bg-surface shadow-xl">
        <form onSubmit={submit} className="p-6 sm:p-8">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Edit server</h2>
              <p className="mt-1 text-sm text-muted">Changing the IP or credential retries the connection.</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted transition hover:bg-surface-hover hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4">
            <Field label="Name">
              <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </Field>
            <Field label="IP address">
              <input required value={ipAddress} onChange={(e) => setIpAddress(e.target.value)} className={cn(inputClass, "font-mono")} />
            </Field>

            {changeCredential ? (
              <Field label="New SSH credential">
                <div className="mb-2 grid grid-cols-2 gap-1 rounded-xl border border-border bg-surface-hover p-1">
                  {(["password", "private_key"] as const).map((type) => (
                    <button
                      type="button"
                      key={type}
                      onClick={() => setCredentialType(type)}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                        credentialType === type ? "bg-accent text-accent-foreground shadow" : "text-muted hover:text-foreground",
                      )}
                    >
                      {type === "password" ? "Root password" : "SSH private key"}
                    </button>
                  ))}
                </div>
                {credentialType === "password" ? (
                  <input
                    required
                    type="password"
                    value={credential}
                    onChange={(e) => setCredential(e.target.value)}
                    className={inputClass}
                  />
                ) : (
                  <textarea
                    required
                    rows={6}
                    value={credential}
                    onChange={(e) => setCredential(e.target.value)}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                    className={cn(inputClass, "font-mono text-xs")}
                  />
                )}
                <button
                  type="button"
                  onClick={() => {
                    setChangeCredential(false);
                    setCredential("");
                  }}
                  className="mt-2 text-xs text-muted transition hover:text-foreground"
                >
                  Keep the credential on file instead
                </button>
              </Field>
            ) : (
              <button
                type="button"
                onClick={() => setChangeCredential(true)}
                className="text-xs font-medium text-accent hover:underline"
              >
                Replace the SSH credential
              </button>
            )}
          </div>

          {retrying ? (
            <p className="mt-4 text-xs leading-relaxed text-warning">
              This will retry the connection — the server goes back to &quot;pending&quot; while Deplyr reconnects.
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
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
