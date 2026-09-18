import Link from "next/link";
import { Server as ServerIcon, Plus } from "lucide-react";
import type { ServerSummary } from "@argo/shared-types";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { ServerStatusBadge } from "@/components/servers/server-status-badge";
import { apiFetch } from "@/lib/api";

async function getServers(): Promise<ServerSummary[]> {
  const res = await apiFetch("/servers");
  if (!res.ok) return [];
  return res.json();
}

export default async function ServersPage() {
  const servers = await getServers();

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Servers</h1>
          <p className="mt-1 text-sm text-muted">
            VPS instances Argo can deploy to.
          </p>
        </div>
        {servers.length > 0 ? (
          <Link href="/servers/new">
            <Button>
              <Plus className="h-4 w-4" strokeWidth={1.75} />
              Connect a server
            </Button>
          </Link>
        ) : null}
      </header>

      {servers.length === 0 ? (
        <EmptyState
          icon={ServerIcon}
          title="No servers yet"
          description="Paste a VPS IP and root credentials to get started. Argo handles Docker, the agent install, and health checks for you."
          action={
            <Link href="/servers/new">
              <Button>Connect a server</Button>
            </Link>
          }
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {servers.map((server) => (
            <li key={server.id}>
              <Link
                href={`/servers/${server.id}`}
                className="flex items-center justify-between px-4 py-3.5 transition-colors hover:bg-surface-hover"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {server.name}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-xs text-muted">
                    {server.ipAddress}
                  </p>
                </div>
                <ServerStatusBadge status={server.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
