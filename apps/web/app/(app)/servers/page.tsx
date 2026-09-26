import Link from "next/link";
import { Server as ServerIcon, Plus } from "lucide-react";
import type { ProjectSummary, ServerSummary } from "@deplyr/shared-types";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClass } from "@/components/ui/button";
import { Page, PageHeader } from "@/components/ui/page";
import { ServerCard } from "@/components/servers/server-card";
import { apiFetch } from "@/lib/api";

async function getServers(): Promise<ServerSummary[]> {
  const res = await apiFetch("/servers");
  if (!res.ok) return [];
  return res.json();
}

async function getProjects(): Promise<ProjectSummary[]> {
  const res = await apiFetch("/projects");
  if (!res.ok) return [];
  return res.json();
}

export default async function ServersPage() {
  const [servers, projects] = await Promise.all([getServers(), getProjects()]);
  const online = servers.filter((s) => s.status === "connected").length;

  return (
    <Page>
      <PageHeader
        eyebrow="Servers"
        title="Your servers"
        description={
          servers.length
            ? `${servers.length} ${servers.length === 1 ? "server" : "servers"} · ${online} online`
            : "VPS instances Deplyr deploys your apps to."
        }
        actions={
          servers.length > 0 ? (
            <Link href="/servers/new" className={buttonClass("primary")}>
              <Plus className="h-4 w-4" strokeWidth={2} />
              Connect server
            </Link>
          ) : null
        }
      />

      {servers.length === 0 ? (
        <EmptyState
          icon={ServerIcon}
          title="No servers yet"
          description="Paste a VPS IP and root credentials to get started. Deplyr handles Docker, the agent install and health checks for you."
          action={
            <Link href="/servers/new" className={buttonClass("primary")}>
              <Plus className="h-4 w-4" strokeWidth={2} />
              Connect a server
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {servers.map((s, i) => (
            <ServerCard
              key={s.id}
              server={s}
              projects={projects.filter((p) => p.serverId === s.id)}
              style={{ animationDelay: `${i * 60}ms` }}
            />
          ))}
          <Link
            href="/servers/new"
            className="group flex min-h-[9.5rem] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border text-muted transition hover:border-accent/50 hover:bg-accent/[0.04] hover:text-accent"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-current/30 transition group-hover:scale-110">
              <Plus className="h-4 w-4" strokeWidth={1.75} />
            </span>
            <span className="text-sm font-medium">Connect a server</span>
          </Link>
        </div>
      )}
    </Page>
  );
}
