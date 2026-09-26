"use client";

import { useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2, Lock, Network, Terminal } from "lucide-react";
import type { DatabaseCredentials, DatabaseSummary } from "@deplyr/shared-types";
import { CopyButton } from "@/components/ui/copy-button";
import { FlatCard } from "@/components/ui/flat-card";
import { SectionTitle } from "@/components/ui/section-title";
import { ENGINE_META } from "@/lib/database-meta";
import { cn } from "@/lib/cn";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function Row({ label, children, action }: { label: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="w-20 shrink-0 text-xs text-muted">{label}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-xs">{children}</span>
      {action}
    </div>
  );
}

function Snippet({ title, icon: Icon, code, copy }: { title: string; icon: typeof Terminal; code: string; copy: () => Promise<string> }) {
  return (
    <div className="rounded-xl border border-border bg-surface-hover">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="flex items-center gap-1.5 text-[11px] text-muted">
          <Icon className="h-3 w-3" strokeWidth={1.75} />
          {title}
        </span>
        <CopyButton value={copy} label={title} />
      </div>
      <pre className="whitespace-pre-wrap break-all px-3 py-2.5 font-mono text-[11px] leading-relaxed text-muted">{code}</pre>
    </div>
  );
}

export function DatabaseConnection({ database, serverIp }: { database: DatabaseSummary; serverIp: string | null }) {
  const [creds, setCreds] = useState<DatabaseCredentials | null>(null);
  const [shown, setShown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta = ENGINE_META[database.type];
  const port = database.port ?? 0;
  const cfg = database.config;
  const username = typeof cfg.username === "string" ? cfg.username : null;
  const dbName = typeof cfg.dbName === "string" ? cfg.dbName : null;

  // The password is fetched only when someone asks for it (reveal or copy),
  // never with the page — each fetch is logged server-side.
  async function ensureCreds(): Promise<DatabaseCredentials> {
    if (creds) return creds;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/databases/${database.id}/credentials`, { credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "unavailable");
      const body: DatabaseCredentials = await res.json();
      setCreds(body);
      return body;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load credentials.");
      throw e;
    } finally {
      setLoading(false);
    }
  }

  async function toggleReveal() {
    if (shown) return setShown(false);
    try {
      await ensureCreds();
      setShown(true);
    } catch {
      /* error state already set */
    }
  }

  const pw = shown && creds ? creds.password : "<password>";
  const conn = shown && creds ? creds.connectionString : `${database.type === "redis" ? "redis://:" : `postgres://${username ?? "user"}:`}<password>@127.0.0.1:${port}${database.type === "postgres" ? `/${dbName ?? "postgres"}` : ""}`;
  const masked = "••••••••••••••••";

  const cli = database.type === "redis" ? `redis-cli -h 127.0.0.1 -p ${port} -a ${pw}` : `PGPASSWORD=${pw} psql -h 127.0.0.1 -p ${port} -U ${username ?? "user"} -d ${dbName ?? "postgres"}`;
  const tunnel = `ssh -N -L ${port}:127.0.0.1:${port} root@${serverIp ?? "<server-ip>"}`;

  return (
    <FlatCard className="animate-fade-up p-6" style={{ animationDelay: "100ms" }}>
      <SectionTitle icon={Network}>Connection</SectionTitle>

      <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-border bg-surface-hover p-3 text-xs leading-relaxed text-muted">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={1.75} />
        <span>
          <span className="font-medium text-foreground">Private.</span> Only reachable from this server. Apps deployed here connect
          with the values below; from your laptop, use an SSH tunnel.
        </span>
      </div>

      {database.type === "postgres" ? (
        <p className="mb-4 text-xs leading-relaxed text-muted">
          This user owns the whole instance. Connect with any client (psql, TablePlus, DBeaver) to create more databases and roles —
          Deplyr manages the server, not your schema.
        </p>
      ) : null}

      <div className="divide-y divide-border">
        <Row label="Host" action={<CopyButton value="127.0.0.1" label="host" />}>127.0.0.1</Row>
        <Row label="Port" action={<CopyButton value={String(port)} label="port" />}>{port}</Row>
        {username ? <Row label="User" action={<CopyButton value={username} label="username" />}>{username}</Row> : null}
        {dbName ? <Row label="Database" action={<CopyButton value={dbName} label="database name" />}>{dbName}</Row> : null}
        <Row
          label="Password"
          action={
            <div className="flex items-center gap-0.5">
              <button
                onClick={toggleReveal}
                disabled={loading}
                aria-label={shown ? "Hide password" : "Reveal password"}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-surface-hover hover:text-foreground"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : shown ? <EyeOff className="h-3.5 w-3.5" strokeWidth={1.75} /> : <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />}
              </button>
              <CopyButton value={async () => (await ensureCreds()).password} label="password" />
            </div>
          }
        >
          <span className={cn(!shown && "text-muted")}>{shown && creds ? creds.password : masked}</span>
        </Row>
        <Row label="URL" action={<CopyButton value={async () => (await ensureCreds()).connectionString} label="connection string" />}>
          <span className={cn(!shown && "text-muted")}>{shown && creds ? creds.connectionString : `${database.type === "redis" ? "redis" : "postgres"}://…`}</span>
        </Row>
      </div>

      {error ? <p className="mt-3 text-xs text-danger">{error}</p> : null}

      <div className="mt-5 space-y-3">
        <Snippet title={`.env (${meta.envKey})`} icon={KeyRound} code={`${meta.envKey}=${conn}`} copy={async () => `${meta.envKey}=${(await ensureCreds()).connectionString}`} />
        <Snippet
          title={meta.cliName}
          icon={Terminal}
          code={cli}
          copy={async () => {
            const c = await ensureCreds();
            return database.type === "redis" ? `redis-cli -h 127.0.0.1 -p ${port} -a ${c.password}` : `PGPASSWORD=${c.password} psql -h 127.0.0.1 -p ${port} -U ${username ?? "user"} -d ${dbName ?? "postgres"}`;
          }}
        />
        <Snippet title="SSH tunnel, from your laptop" icon={Network} code={`${tunnel}\n# then connect to localhost:${port}`} copy={async () => tunnel} />
      </div>
    </FlatCard>
  );
}
