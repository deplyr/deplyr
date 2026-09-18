"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { ServerSummary, SshCredentialType } from "@argo/shared-types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const inputClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none";

export default function NewServerPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [ipAddress, setIpAddress] = useState("");
  const [credentialType, setCredentialType] = useState<SshCredentialType>("password");
  const [credential, setCredential] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch(`${API_URL}/servers`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, ipAddress, credentialType, credential }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Could not register this server.");
      setSubmitting(false);
      return;
    }

    const server: ServerSummary = await res.json();
    router.push(`/servers/${server.id}`);
  }

  return (
    <div className="mx-auto max-w-lg px-8 py-10">
      <header className="mb-8">
        <h1 className="text-lg font-semibold">Connect a server</h1>
        <p className="mt-1 text-sm text-muted">
          Paste your VPS&apos;s IP and root credentials. Argo connects once
          over SSH to install everything it needs — you won&apos;t need a
          terminal after this.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Field label="Name">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Production"
            className={inputClass}
          />
        </Field>

        <Field label="IP address">
          <input
            required
            value={ipAddress}
            onChange={(e) => setIpAddress(e.target.value)}
            placeholder="203.0.113.42"
            className={cn(inputClass, "font-mono")}
          />
        </Field>

        <Field label="Credential type">
          <div className="flex gap-2">
            {(["password", "private_key"] as const).map((type) => (
              <button
                type="button"
                key={type}
                onClick={() => setCredentialType(type)}
                className={cn(
                  "flex-1 rounded-md border px-3 py-2 text-sm transition-colors",
                  credentialType === type
                    ? "border-accent bg-accent/10 text-foreground"
                    : "border-border text-muted hover:text-foreground",
                )}
              >
                {type === "password" ? "Root password" : "SSH private key"}
              </button>
            ))}
          </div>
        </Field>

        <Field label={credentialType === "password" ? "Root password" : "Private key"}>
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
        </Field>

        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? "Connecting..." : "Connect server"}
        </Button>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}
