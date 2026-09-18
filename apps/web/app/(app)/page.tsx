import Link from "next/link";
import { Server as ServerIcon } from "lucide-react";
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

export default async function DashboardPage() {
  const servers = await getServers();

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-muted">
          An overview of your servers and live apps.
        </p>
      </header>

      {servers.length === 0 ? (
        <EmptyState
          icon={ServerIcon}
          title="No servers connected yet"
          description="Connect a VPS to start deploying. Argo installs everything it needs over SSH — you'll never need to open a terminal again."
          action={
            <Link href="/servers">
              <Button>Connect a server</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
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
          <Link href="/servers/new" className="inline-block">
            <Button variant="secondary">Connect another server</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
