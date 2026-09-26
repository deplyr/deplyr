"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, Loader2, Lock, X } from "lucide-react";
import {
  DATABASE_DEFAULT_PORTS,
  DATABASE_VERSIONS,
  REDIS_PERSISTENCE,
  REDIS_POLICIES,
  type CreateDatabaseInput,
  type DatabaseSummary,
  type DatabaseType,
  type RedisPersistence,
  type RedisPolicy,
} from "@deplyr/shared-types";
import { Button } from "@/components/ui/button";
import { Field, FormError, inputClass } from "@/components/ui/field";
import { ENGINE_META } from "@/lib/database-meta";
import { cn } from "@/lib/cn";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const POLICY_HELP: Record<RedisPolicy, string> = {
  "allkeys-lru": "Evict least-recently-used keys when full — the usual cache setting.",
  "allkeys-lfu": "Evict least-frequently-used keys when full.",
  "volatile-lru": "Only evict keys that have an expiry set.",
  noeviction: "Never evict — writes fail when memory is full.",
};

const PERSISTENCE_HELP: Record<RedisPersistence, string> = {
  none: "Pure cache. Data is lost on restart.",
  rdb: "Periodic snapshots. Small loss window on a crash.",
  aof: "Logs every write. Safest, a bit slower.",
};

export function CreateDatabaseDialog({
  serverId,
  existingCount,
  open,
  onClose,
}: {
  serverId: string;
  existingCount: number;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const nameRef = useRef<HTMLInputElement>(null);

  const [type, setType] = useState<DatabaseType>("postgres");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [version, setVersion] = useState<string>(DATABASE_VERSIONS.postgres[0]!);
  const [port, setPort] = useState("");
  const [memory, setMemory] = useState("");
  const [dbName, setDbName] = useState("app");
  const [username, setUsername] = useState("app");
  const [policy, setPolicy] = useState<RedisPolicy>("allkeys-lru");
  const [persistence, setPersistence] = useState<RedisPersistence>("none");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Fresh form each time it opens.
  useEffect(() => {
    if (!open) return;
    setType("postgres");
    setNameTouched(false);
    setPort("");
    setMemory("");
    setDbName("app");
    setUsername("app");
    setPolicy("allkeys-lru");
    setPersistence("none");
    setError(null);
    setSubmitting(false);
    setTimeout(() => nameRef.current?.focus(), 30);
  }, [open]);

  // Sensible defaults follow the engine, until the user takes over the field.
  useEffect(() => {
    setVersion(DATABASE_VERSIONS[type][0]!);
    setMemory(type === "redis" ? "256" : "");
    if (!nameTouched) setName(`${type === "redis" ? "redis" : "postgres"}-${existingCount + 1}`);
  }, [type, existingCount, nameTouched]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const defaultPort = DATABASE_DEFAULT_PORTS[type];
  const shownPort = port || String(defaultPort);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const input: CreateDatabaseInput = {
      type,
      name,
      version,
      ...(port ? { port: Number(port) } : {}),
      ...(memory ? { memoryLimitMb: Number(memory) } : {}),
      ...(type === "postgres" ? { postgres: { dbName, username } } : { redis: { policy, persistence } }),
    };

    try {
      const res = await fetch(`${API_URL}/servers/${serverId}/databases`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not create this database.");
        setSubmitting(false);
        return;
      }
      const created: DatabaseSummary = body;
      router.push(`/servers/${serverId}/databases/${created.id}`);
    } catch {
      setError("Could not reach the server.");
      setSubmitting(false);
    }
  }

  // Portalled to <body>: a `fixed` element inside an ancestor with its own
  // stacking/scroll context could otherwise clip or mis-position.
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto px-4 py-[6vh]" role="dialog" aria-modal="true" aria-label="New database">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-fade-up" onClick={onClose} />
      <div className="relative w-full max-w-xl animate-fade-up rounded-2xl border border-border bg-surface shadow-xl">
        <form onSubmit={submit} className="p-6 sm:p-8">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">New database</h2>
              <p className="mt-1 text-sm text-muted">Runs in a container on this server, next to your apps.</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted transition hover:bg-surface-hover hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* engine */}
          <div className="grid grid-cols-2 gap-3">
            {(Object.keys(ENGINE_META) as DatabaseType[]).map((t) => {
              const meta = ENGINE_META[t];
              const Icon = meta.icon;
              const active = t === type;
              return (
                <button
                  type="button"
                  key={t}
                  onClick={() => setType(t)}
                  className={cn(
                    "relative flex flex-col gap-2 rounded-xl border p-4 text-left transition",
                    active ? "border-accent/60 bg-accent/10 ring-4 ring-accent/10" : "border-border bg-surface-hover hover:bg-surface",
                  )}
                >
                  <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg", active ? "bg-accent/20 text-accent" : "bg-surface text-muted")}>
                    <Icon className="h-4 w-4" strokeWidth={1.75} />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">{meta.label}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted">{meta.blurb}</span>
                  </span>
                  {active ? <Check className="absolute right-3 top-3 h-4 w-4 text-accent" strokeWidth={2.5} /> : null}
                </button>
              );
            })}
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <Field label="Name" hint="Lowercase letters, digits and hyphens.">
              <input
                ref={nameRef}
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value.toLowerCase());
                  setNameTouched(true);
                }}
                className={cn(inputClass, "font-mono")}
              />
            </Field>
            <Field label="Version">
              <select value={version} onChange={(e) => setVersion(e.target.value)} className={inputClass}>
                {DATABASE_VERSIONS[type].map((v) => (
                  <option key={v} value={v}>
                    {ENGINE_META[type].label} {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Port" hint={`Blank = ${defaultPort} if free, otherwise a random port.`}>
              <input
                type="number"
                min={1024}
                max={65535}
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder={`Auto (${defaultPort})`}
                className={cn(inputClass, "font-mono")}
              />
            </Field>
            <Field label="Memory limit (MB)" hint={type === "redis" ? "Redis evicts or refuses writes at 75% of this." : "Blank = no limit."}>
              <input
                type="number"
                min={64}
                value={memory}
                onChange={(e) => setMemory(e.target.value)}
                placeholder={type === "redis" ? "256" : "No limit"}
                className={cn(inputClass, "font-mono")}
              />
            </Field>
          </div>

          {type === "postgres" ? (
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <Field label="Database name">
                <input required value={dbName} onChange={(e) => setDbName(e.target.value.toLowerCase())} className={cn(inputClass, "font-mono")} />
              </Field>
              <Field label="Username">
                <input required value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} className={cn(inputClass, "font-mono")} />
              </Field>
            </div>
          ) : (
            <div className="mt-5 space-y-5">
              <Field label="When memory is full" hint={POLICY_HELP[policy]}>
                <select value={policy} onChange={(e) => setPolicy(e.target.value as RedisPolicy)} className={inputClass}>
                  {REDIS_POLICIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </Field>
              <div>
                <span className="mb-1.5 block text-sm font-medium">Persistence</span>
                <div className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-surface-hover p-1">
                  {REDIS_PERSISTENCE.map((p) => (
                    <button
                      type="button"
                      key={p}
                      onClick={() => setPersistence(p)}
                      className={cn(
                        "rounded-lg px-3 py-2 text-sm font-medium uppercase transition",
                        persistence === p ? "bg-accent text-accent-foreground shadow" : "text-muted hover:text-foreground",
                      )}
                    >
                      {p === "none" ? "None" : p}
                    </button>
                  ))}
                </div>
                <span className="mt-1.5 block text-xs text-muted">{PERSISTENCE_HELP[persistence]}</span>
              </div>
            </div>
          )}

          <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-border bg-surface-hover p-3.5 text-xs leading-relaxed text-muted">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={1.75} />
            <span>
              <span className="font-medium text-foreground">Private by default.</span> Listens on{" "}
              <code className="font-mono text-foreground">127.0.0.1:{shownPort}</code> — reachable only from apps on this
              server. A strong password is generated for you.
            </span>
          </div>

          {error ? (
            <div className="mt-4">
              <FormError>{error}</FormError>
            </div>
          ) : null}

          <div className="mt-6 flex items-center justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {submitting ? "Creating…" : "Create database"}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
