"use client";

import { useEffect, useState } from "react";
import { Database as DatabaseIcon } from "lucide-react";
import type { DatabaseSummary } from "@argo/shared-types";
import { Button } from "@/components/ui/button";

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
    <div className="rounded-lg border border-border bg-surface/40 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DatabaseIcon className="h-4 w-4 text-muted" strokeWidth={1.75} />
          <p className="text-sm font-medium text-foreground">Database</p>
        </div>
        {!database ? (
          <Button variant="secondary" onClick={handleCreate} disabled={creating}>
            {creating ? "Adding..." : "Add a Postgres database"}
          </Button>
        ) : null}
      </div>

      {database ? (
        <div className="mt-3">
          {database.status === "provisioning" ? (
            <p className="text-sm text-muted">Provisioning...</p>
          ) : database.status === "running" ? (
            <p className="text-sm text-foreground">
              Connected —{" "}
              <code className="font-mono text-xs">{database.connectionSecretKey}</code> was
              written to secrets. Redeploy to pick it up.
            </p>
          ) : (
            <p className="text-sm text-danger">
              Something went wrong provisioning this database.
            </p>
          )}
        </div>
      ) : null}

      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
    </div>
  );
}
