"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Database as DatabaseIcon, Loader2 } from "lucide-react";
import type { DatabaseSummary } from "@deplyr/shared-types";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { FlatCard } from "@/components/ui/flat-card";
import { Badge } from "@/components/ui/badge";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const POLL_INTERVAL_MS = 2000;

export function DatabaseCard({
  projectId,
  initial,
}: {
  projectId: string;
  initial: DatabaseSummary | null;
}) {
  const [database, setDatabase] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!database || database.status !== "provisioning") return;
    const timer = setTimeout(async () => {
      const res = await fetch(`${API_URL}/projects/${projectId}/databases`, {
        credentials: "include",
      });
      if (!res.ok) return;
      const rows: DatabaseSummary[] = await res.json();
      setDatabase(rows[0] ?? null);
    }, POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [database, projectId]);

  async function handleCreate() {
    setCreating(true);
    setError(null);

    const res = await fetch(`${API_URL}/projects/${projectId}/databases`, {
      method: "POST",
      credentials: "include",
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Could not add a database.");
      setCreating(false);
      return;
    }

    const created: DatabaseSummary = await res.json();
    setDatabase(created);
    setCreating(false);
  }

  return (
    <FlatCard className="p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <DatabaseIcon className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <div>
            <p className="text-sm font-semibold">Database</p>
            <p className="text-xs text-muted">Postgres</p>
          </div>
        </div>
        {database ? (
          <Badge tone={database.status === "running" ? "success" : database.status === "error" ? "danger" : database.status === "stopped" ? "neutral" : "warning"}>
            {database.status}
          </Badge>
        ) : null}
      </div>

      {!database ? (
        <div className="mt-4">
          <p className="mb-3 text-xs leading-relaxed text-muted">
            One click adds a managed Postgres next to your app and wires up the connection string.
          </p>
          <Button variant="secondary" onClick={handleCreate} disabled={creating} className="w-full">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {creating ? "Adding…" : "Add Postgres"}
          </Button>
        </div>
      ) : database.status === "provisioning" ? (
        <p className="mt-4 flex items-center gap-2 text-xs text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-warning" /> Provisioning — this takes a few seconds.
        </p>
      ) : database.status === "running" ? (
        <>
          <p className="mt-4 text-xs leading-relaxed text-muted">
            <code className="rounded bg-surface-hover px-1.5 py-0.5 font-mono text-[11px] text-foreground">
              {database.connectionSecretKey}
            </code>{" "}
            was added to your secrets. Redeploy to pick it up.
          </p>
          <Link
            href={`/servers/${database.serverId}/databases/${database.id}`}
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
          >
            Health, stats &amp; connection
            <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
          </Link>
        </>
      ) : (
        <p className="mt-4 text-xs text-danger">Something went wrong provisioning this database.</p>
      )}

      {error ? <div className="mt-3"><FormError>{error}</FormError></div> : null}
    </FlatCard>
  );
}
