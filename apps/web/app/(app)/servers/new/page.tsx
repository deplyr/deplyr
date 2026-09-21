"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Container, Loader2, Lock, ShieldCheck, Terminal, Waypoints } from "lucide-react";
import type { ServerSummary, SshCredentialType } from "@deplyr/shared-types";
import { Button } from "@/components/ui/button";
import { Field, FormError, inputClass } from "@/components/ui/field";
import { GlassCard } from "@/components/ui/glass-card";
import { Page, PageHeader } from "@/components/ui/page";
import { cn } from "@/lib/cn";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const steps = [
  { icon: Terminal, title: "Connects once over SSH", body: "Your credentials are used a single time, then never needed again." },
  { icon: Container, title: "Installs Docker", body: "Everything your apps and databases run in." },
  { icon: Waypoints, title: "Installs the Deplyr agent", body: "A small daemon that dials back to Deplyr and stays connected." },
  { icon: ShieldCheck, title: "Sets up nginx + SSL", body: "Routing and HTTPS for every app you deploy." },
];

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
    <Page width="form">
      <PageHeader
        eyebrow="Servers"
        title="Connect a server"
        description="Paste your VPS's IP and root credentials. Deplyr sets everything up — you won't need a terminal after this."
        back={{ href: "/servers", label: "All servers" }}
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <GlassCard className="animate-fade-up lg:col-span-3" innerClassName="p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
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
            </div>

            <div>
              <span className="mb-1.5 block text-sm font-medium">Sign in with</span>
              <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
                {(["password", "private_key"] as const).map((type) => (
                  <button
                    type="button"
                    key={type}
                    onClick={() => setCredentialType(type)}
                    className={cn(
                      "rounded-lg px-3 py-2 text-sm font-medium transition",
                      credentialType === type
                        ? "bg-accent text-accent-foreground shadow"
                        : "text-muted hover:text-foreground",
                    )}
                  >
                    {type === "password" ? "Root password" : "SSH private key"}
                  </button>
                ))}
              </div>
            </div>

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

            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
              Encrypted at rest with your instance&apos;s master key.
            </p>

            {error ? <FormError>{error}</FormError> : null}

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {submitting ? "Connecting…" : "Connect server"}
            </Button>
          </form>
        </GlassCard>

        <aside className="animate-fade-up space-y-3 lg:col-span-2" style={{ animationDelay: "80ms" }}>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted">What happens next</p>
          {steps.map(({ icon: Icon, title, body }, i) => (
            <div key={title} className="flex gap-3.5 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <Icon className="h-4 w-4" strokeWidth={1.75} />
              </span>
              <div>
                <p className="text-sm font-medium">
                  <span className="mr-1.5 font-mono text-xs text-muted">{i + 1}.</span>
                  {title}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{body}</p>
              </div>
            </div>
          ))}
        </aside>
      </div>
    </Page>
  );
}
