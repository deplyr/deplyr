"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { ServerSummary } from "@argo/shared-types";
import { ServerStatusBadge } from "@/components/servers/server-status-badge";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const POLL_INTERVAL_MS = 2500;

export default function ServerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [server, setServer] = useState<ServerSummary | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      const res = await fetch(`${API_URL}/servers/${id}`, { credentials: "include" });
      if (cancelled) return;

      if (res.status === 404) {
        setNotFound(true);
        return;
      }

      const data: ServerSummary = await res.json();
      if (cancelled) return;
      setServer(data);

      if (data.status === "pending" || data.status === "installing") {
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id]);

  if (notFound) {
    return (
      <div className="mx-auto max-w-lg px-8 py-10 text-sm text-muted">
        Server not found.
      </div>
    );
  }

  if (!server) {
    return (
      <div className="mx-auto max-w-lg px-8 py-10 text-sm text-muted">Loading...</div>
    );
  }

  const inProgress = server.status === "pending" || server.status === "installing";

  return (
    <div className="mx-auto max-w-lg px-8 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">{server.name}</h1>
          <p className="mt-1 font-mono text-sm text-muted">{server.ipAddress}</p>
        </div>
        <ServerStatusBadge status={server.status} />
      </header>

      <div className="rounded-lg border border-border bg-surface/40 p-5">
        {server.status === "connected" ? (
          <p className="text-sm text-foreground">
            Argo is connected to this server and ready to deploy to it.
          </p>
        ) : (
          <div className="flex items-center gap-3">
            {inProgress ? (
              <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-warning" />
            ) : null}
            <p className="text-sm text-muted">
              {server.statusDetail ?? "Waiting to start..."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
