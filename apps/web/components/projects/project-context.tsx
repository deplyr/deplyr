"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type {
  DatabaseSummary,
  DeploySummary,
  HealthSummary,
  ProjectSummary,
  SecretSummary,
  ServerSummary,
} from "@deplyr/shared-types";
import { Page, PageHeader } from "@/components/ui/page";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const DEPLOYING_POLL_MS = 3000;
const IDLE_POLL_MS = 15_000;

interface ProjectContextValue {
  project: ProjectSummary;
  health: HealthSummary;
  /** Newest first. */
  deploys: DeploySummary[];
  database: DatabaseSummary | null;
  secrets: SecretSummary[];
  server: ServerSummary | null;
  refresh: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used inside <ProjectProvider>");
  return ctx;
}

const get = async <T,>(path: string, fallback: T): Promise<T> => {
  try {
    const res = await fetch(`${API_URL}${path}`, { credentials: "include" });
    return res.ok ? ((await res.json()) as T) : fallback;
  } catch {
    return fallback;
  }
};

/**
 * One polled copy of a project shared by the hero, the tabs and every tab's
 * content, so they can't disagree (the "Deploying" pill, the tab badges and
 * the overview all read the same state). Polls faster while a deploy runs.
 */
export function ProjectProvider({ id, children }: { id: string; children: ReactNode }) {
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [health, setHealth] = useState<HealthSummary>({ isHealthy: null, lastCheckedAt: null });
  const [deploys, setDeploys] = useState<DeploySummary[]>([]);
  const [database, setDatabase] = useState<DatabaseSummary | null>(null);
  const [secrets, setSecrets] = useState<SecretSummary[]>([]);
  const [server, setServer] = useState<ServerSummary | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`${API_URL}/projects/${id}`, { credentials: "include" }).catch(() => null);
    if (!res) return;
    if (res.status === 404) {
      setNotFound(true);
      return;
    }
    if (!res.ok) return;
    const p: ProjectSummary = await res.json();
    setProject(p);

    const [h, d, dbs, s, srv] = await Promise.all([
      get<HealthSummary>(`/projects/${id}/health`, { isHealthy: null, lastCheckedAt: null }),
      get<DeploySummary[]>(`/projects/${id}/deploys`, []),
      get<DatabaseSummary[]>(`/projects/${id}/databases`, []),
      get<SecretSummary[]>(`/projects/${id}/secrets`, []),
      get<ServerSummary | null>(`/servers/${p.serverId}`, null),
    ]);
    setHealth(h);
    setDeploys(d);
    setDatabase(dbs[0] ?? null);
    setSecrets(s);
    setServer(srv);
  }, [id]);

  const deploying = project?.status === "deploying";
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, deploying ? DEPLOYING_POLL_MS : IDLE_POLL_MS);
    return () => clearInterval(timer);
  }, [refresh, deploying]);

  if (notFound) {
    return (
      <Page width="narrow">
        <PageHeader back={{ href: "/servers", label: "Servers" }} title="Project not found" />
      </Page>
    );
  }

  if (!project) {
    return (
      <Page>
        <div className="h-40 animate-pulse rounded-2xl bg-white/[0.04]" />
        <div className="h-14 animate-pulse rounded-2xl bg-white/[0.04]" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="h-72 animate-pulse rounded-2xl bg-white/[0.04] lg:col-span-2" />
          <div className="h-72 animate-pulse rounded-2xl bg-white/[0.04]" />
        </div>
      </Page>
    );
  }

  return (
    <ProjectContext.Provider value={{ project, health, deploys, database, secrets, server, refresh }}>
      {children}
    </ProjectContext.Provider>
  );
}
