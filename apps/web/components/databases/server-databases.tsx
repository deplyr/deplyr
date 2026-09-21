"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Database, Plus } from "lucide-react";
import type { DatabaseSummary } from "@deplyr/shared-types";
import { CreateDatabaseDialog } from "@/components/databases/create-database-dialog";
import { DbStatusPill } from "@/components/databases/db-status-pill";
import { GlassCard } from "@/components/ui/glass-card";
import { SectionTitle } from "@/components/ui/section-title";
import { ENGINE_META, isBusy } from "@/lib/database-meta";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** The two numbers worth seeing without opening the database. */
function headline(db: DatabaseSummary): string | null {
  const s = db.stats;
  if (!s || db.isUp === false) return null;
  const n = (v: number | null | undefined) => (v === null || v === undefined ? "—" : String(v));
  return db.type === "redis"
    ? `${s.hitRate == null ? "no" : `${s.hitRate}%`} hit rate · ${n(s.memUsedMb)} MB`
    : `${n(s.connections)} conns · ${n(s.sizeMb)} MB`;
}

export function ServerDatabases({ serverId, canCreate }: { serverId: string; canCreate: boolean }) {
  const [databases, setDatabases] = useState<DatabaseSummary[] | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/servers/${serverId}/databases`, { credentials: "include" });
      if (res.ok) setDatabases(await res.json());
    } catch {
      /* keep what we have */
    }
  }, [serverId]);

  useEffect(() => {
    load();
  }, [load]);

  // Quick while something's being created or removed, relaxed otherwise
  // (the agent's health samples land every 30s anyway).
  const busy = databases?.some(isBusy) ?? false;
  useEffect(() => {
    const timer = setInterval(load, busy ? 2500 : 15_000);
    return () => clearInterval(timer);
  }, [load, busy]);

  return (
    <GlassCard className="animate-fade-up" style={{ animationDelay: "140ms" }} innerClassName="p-6">
      <SectionTitle icon={Database} meta={databases?.length ? `${databases.length} total` : undefined}>
        Databases
      </SectionTitle>

      {databases === null ? (
        <div className="h-16 animate-pulse rounded-xl bg-white/[0.04]" />
      ) : databases.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Database className="h-5 w-5" strokeWidth={1.5} />
          </span>
          <p className="mt-3 text-sm font-medium">No databases on this server</p>
          <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted">
            Spin up Postgres or Redis in a click, then see its health and stats here.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-white/[0.06]">
          {databases.map((d) => {
            const meta = ENGINE_META[d.type];
            const Icon = meta.icon;
            const stat = headline(d);
            return (
              <li key={d.id}>
                <Link
                  href={`/servers/${serverId}/databases/${d.id}`}
                  className="group -mx-2 flex items-center gap-4 rounded-xl px-2 py-3.5 transition hover:bg-white/[0.03]"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                    <Icon className="h-4 w-4" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{d.name}</p>
                    <p className="truncate font-mono text-xs text-muted">
                      {meta.label} {d.version} · :{d.port}
                      {d.projectId ? " · linked" : ""}
                    </p>
                  </div>
                  {stat ? <p className="hidden shrink-0 font-mono text-xs text-muted md:block">{stat}</p> : null}
                  <DbStatusPill database={d} />
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted transition group-hover:translate-x-0.5" strokeWidth={1.75} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {canCreate ? (
        <button
          onClick={() => setOpen(true)}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-white/15 px-3 py-2 text-xs text-muted transition hover:border-accent/50 hover:text-accent"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          New database
        </button>
      ) : (
        <p className="mt-4 text-xs text-muted">Connect the server first to create databases on it.</p>
      )}

      <CreateDatabaseDialog serverId={serverId} existingCount={databases?.length ?? 0} open={open} onClose={() => setOpen(false)} />
    </GlassCard>
  );
}
