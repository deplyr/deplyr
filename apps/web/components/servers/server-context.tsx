"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { DatabaseSummary, ProjectSummary, ServerSummary } from "@deplyr/shared-types";
import { Page, PageHeader } from "@/components/ui/page";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const INSTALLING_POLL_MS = 2500;
const CONNECTED_POLL_MS = 10_000;
const COUNTS_POLL_MS = 15_000;
// The agent reports on a short interval; this long without one means trouble.
const STALE_METRICS_MS = 2 * 60_000;

export interface ServerCounts {
  databases: { total: number; unhealthy: number } | null;
  projects: { total: number; live: number } | null;
}

interface ServerContextValue {
  server: ServerSummary;
  counts: ServerCounts;
  online: boolean;
  /** Connected, but the agent hasn't reported lately. */
  stale: boolean;
}

const ServerContext = createContext<ServerContextValue | null>(null);

export function useServer(): ServerContextValue {
  const ctx = useContext(ServerContext);
  if (!ctx) throw new Error("useServer must be used inside <ServerProvider>");
  return ctx;
}

/**
 * Owns the one polled copy of a server that every tab reads, so the hero,
 * the tab badges and each tab's content can never disagree with each other —
 * and switching tabs doesn't refetch or flash.
 */
export function ServerProvider({ id, children }: { id: string; children: ReactNode }) {
  const [server, setServer] = useState<ServerSummary | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [counts, setCounts] = useState<ServerCounts>({ databases: null, projects: null });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const res = await fetch(`${API_URL}/servers/${id}`, { credentials: "include" });
        if (cancelled) return;
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        const data: ServerSummary = await res.json();
        if (cancelled) return;
        setServer(data);
        setNow(Date.now());
        if (data.status === "pending" || data.status === "installing") timer = setTimeout(poll, INSTALLING_POLL_MS);
        else if (data.status === "connected") timer = setTimeout(poll, CONNECTED_POLL_MS);
      } catch {
        if (!cancelled) timer = setTimeout(poll, CONNECTED_POLL_MS);
      }
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    async function loadCounts() {
      try {
        const opts = { credentials: "include" as const };
        const [dbRes, projRes] = await Promise.all([fetch(`${API_URL}/servers/${id}/databases`, opts), fetch(`${API_URL}/projects`, opts)]);
        const dbs: DatabaseSummary[] = dbRes.ok ? await dbRes.json() : [];
        const projects: ProjectSummary[] = projRes.ok ? (await projRes.json()).filter((p: ProjectSummary) => p.serverId === id) : [];
        if (cancelled) return;
        setCounts({
          databases: { total: dbs.length, unhealthy: dbs.filter((d) => d.status === "error" || d.isUp === false).length },
          projects: { total: projects.length, live: projects.filter((p) => p.status === "live").length },
        });
      } catch {
        /* keep the last counts */
      }
    }
    loadCounts();
    const timer = setInterval(loadCounts, COUNTS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id]);

  if (notFound) {
    return (
      <Page width="narrow">
        <PageHeader back={{ href: "/servers", label: "All servers" }} title="Server not found" />
      </Page>
    );
  }

  if (!server) {
    return (
      <Page>
        <div className="h-40 animate-pulse rounded-2xl bg-white/[0.04]" />
        <div className="h-10 animate-pulse rounded-xl bg-white/[0.04]" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="h-72 animate-pulse rounded-2xl bg-white/[0.04] lg:col-span-2" />
          <div className="h-72 animate-pulse rounded-2xl bg-white/[0.04]" />
        </div>
      </Page>
    );
  }

  const online = server.status === "connected";
  const age = server.metricsUpdatedAt ? now - new Date(server.metricsUpdatedAt).getTime() : null;
  const stale = online && age !== null && age > STALE_METRICS_MS;

  return <ServerContext.Provider value={{ server, counts, online, stale }}>{children}</ServerContext.Provider>;
}
