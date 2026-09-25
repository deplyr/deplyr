"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, GitBranch, Github, Globe, Loader2, Lock, Search, Server as ServerIcon } from "lucide-react";
import type {
  GithubRepoSummary,
  GithubBranchSummary,
  ServerSummary,
  ProjectSummary,
  DetectionResult,
} from "@deplyr/shared-types";
import { Button, buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FormError, inputClass } from "@/components/ui/field";
import { GlassCard } from "@/components/ui/glass-card";
import { Page, PageHeader } from "@/components/ui/page";
import { timeAgo } from "@/lib/time-ago";
import { cn } from "@/lib/cn";
import { handleGithubExpired } from "@/lib/github-expired";
import { projectAddress } from "@/lib/app-domain";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function StepLabel({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/15 font-mono text-xs font-semibold text-accent">
        {n}
      </span>
      <h2 className="text-sm font-semibold">{children}</h2>
    </div>
  );
}

export default function NewProjectPage() {
  const router = useRouter();
  const [servers, setServers] = useState<ServerSummary[] | null>(null);
  const [repos, setRepos] = useState<GithubRepoSummary[] | null>(null);
  const [reposError, setReposError] = useState<string | null>(null);

  const [serverId, setServerId] = useState("");
  const [repoFilter, setRepoFilter] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<GithubRepoSummary | null>(null);
  const [branches, setBranches] = useState<GithubBranchSummary[] | null>(null);
  const [branch, setBranch] = useState("");
  const [name, setName] = useState("");
  const [rootDir, setRootDir] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/servers`, { credentials: "include" })
      .then((r) => r.json())
      .then((all: ServerSummary[]) => {
        const connected = all.filter((s) => s.status === "connected");
        setServers(connected);
        // Coming from a server card (?server=…), or only one choice: preselect.
        const wanted = new URLSearchParams(window.location.search).get("server");
        const preset = connected.find((s) => s.id === wanted) ?? (connected.length === 1 ? connected[0] : undefined);
        if (preset) setServerId(preset.id);
      });

    fetch(`${API_URL}/github/repos`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => null);
          if (handleGithubExpired(body)) return null;
          throw new Error(body?.error ?? "failed");
        }
        return r.json();
      })
      .then((body) => {
        if (body) setRepos(body);
      })
      .catch(() =>
        setReposError("Could not load your GitHub repos. Connect GitHub in Settings and try again."),
      );
  }, []);

  useEffect(() => {
    if (!selectedRepo) return;
    setBranches(null);
    setBranch(selectedRepo.defaultBranch);
    setName(selectedRepo.fullName.split("/")[1] ?? selectedRepo.fullName);
    fetch(`${API_URL}/github/repos/${selectedRepo.fullName}/branches`, {
      credentials: "include",
    })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => null);
          if (handleGithubExpired(body)) return;
          throw new Error(body?.error ?? "failed");
        }
        setBranches(await r.json());
      })
      .catch(() => setBranches([{ name: selectedRepo.defaultBranch }]));
  }, [selectedRepo]);

  const filteredRepos = useMemo(() => {
    if (!repos) return [];
    const q = repoFilter.trim().toLowerCase();
    if (!q) return repos.slice(0, 20);
    return repos.filter((r) => r.fullName.toLowerCase().includes(q)).slice(0, 20);
  }, [repos, repoFilter]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedRepo || !serverId) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch(`${API_URL}/projects`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serverId,
        name,
        githubRepo: selectedRepo.fullName,
        githubBranch: branch,
        ...(rootDir.trim() ? { rootDir: rootDir.trim() } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      if (handleGithubExpired(body)) return;
      setError(body?.error ?? "Could not create this project.");
      setSubmitting(false);
      return;
    }

    const project: ProjectSummary = await res.json();
    router.push(`/projects/${project.id}`);
  }

  if (servers && servers.length === 0) {
    return (
      <Page width="narrow">
        <PageHeader eyebrow="Projects" title="New project" back={{ href: "/projects", label: "All projects" }} />
        <EmptyState
          icon={ServerIcon}
          title="Connect a server first"
          description="Projects deploy to one of your servers. Add a VPS and it'll be ready in a couple of minutes."
          action={
            <Link href="/servers/new" className={buttonClass("primary")}>
              Connect a server
            </Link>
          }
        />
      </Page>
    );
  }

  const chosenServer = servers?.find((s) => s.id === serverId);
  const slug = (name || "your-project").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const ready = Boolean(selectedRepo && serverId && name);

  return (
    <Page width="form">
      <PageHeader
        eyebrow="Projects"
        title="New project"
        description="Pick a server and a repo. Deplyr figures out the framework, package manager and commands on its own — you can adjust them afterwards."
        back={{ href: "/projects", label: "All projects" }}
      />

      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-5">
        <GlassCard className="animate-fade-up lg:col-span-3" innerClassName="space-y-8 p-6 sm:p-8">
          <section>
            <StepLabel n={1}>Choose a server</StepLabel>
            {servers === null ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : (
              <div className="grid gap-2.5 sm:grid-cols-2">
                {servers.map((s) => {
                  const active = s.id === serverId;
                  return (
                    <button
                      type="button"
                      key={s.id}
                      onClick={() => setServerId(s.id)}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border p-3.5 text-left transition",
                        active
                          ? "border-accent/60 bg-accent/10 ring-4 ring-accent/10"
                          : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]",
                      )}
                    >
                      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", active ? "bg-accent/20 text-accent" : "bg-white/[0.05] text-muted")}>
                        <ServerIcon className="h-4 w-4" strokeWidth={1.75} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{s.name}</span>
                        <span className="block truncate font-mono text-[11px] text-muted">{s.ipAddress}</span>
                      </span>
                      {active ? <Check className="h-4 w-4 text-accent" strokeWidth={2.5} /> : null}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <StepLabel n={2}>Pick a repository</StepLabel>
            {reposError ? (
              <FormError>{reposError}</FormError>
            ) : selectedRepo ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-accent/40 bg-accent/[0.07] px-4 py-3">
                <span className="flex min-w-0 items-center gap-2.5">
                  <Github className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.75} />
                  <span className="truncate font-mono text-sm">{selectedRepo.fullName}</span>
                  {selectedRepo.private ? <Lock className="h-3.5 w-3.5 shrink-0 text-muted" strokeWidth={1.75} /> : null}
                </span>
                <button type="button" onClick={() => setSelectedRepo(null)} className="text-xs text-muted transition hover:text-foreground">
                  Change
                </button>
              </div>
            ) : (
              <div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={1.75} />
                  <input
                    value={repoFilter}
                    onChange={(e) => setRepoFilter(e.target.value)}
                    placeholder={repos ? "Search your repos…" : "Loading your repos…"}
                    className={cn(inputClass, "pl-10")}
                  />
                </div>
                {repos ? (
                  <ul className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-1.5">
                    {filteredRepos.length === 0 ? (
                      <li className="px-3 py-3 text-sm text-muted">No repos match.</li>
                    ) : (
                      filteredRepos.map((repo) => (
                        <li key={repo.fullName}>
                          <button
                            type="button"
                            onClick={() => setSelectedRepo(repo)}
                            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-white/[0.05]"
                          >
                            <Github className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} />
                            <span className="min-w-0 flex-1 truncate font-mono text-xs">{repo.fullName}</span>
                            {repo.private ? <Lock className="h-3 w-3 shrink-0 text-muted" strokeWidth={1.75} /> : null}
                            <span className="shrink-0 text-[11px] text-muted">{timeAgo(repo.updatedAt)}</span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                ) : null}
              </div>
            )}
          </section>

          {selectedRepo ? (
            <section className="animate-fade-up">
              <StepLabel n={3}>Details</StepLabel>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Branch">
                  <select required value={branch} onChange={(e) => setBranch(e.target.value)} className={inputClass}>
                    {(branches ?? [{ name: selectedRepo.defaultBranch }]).map((b) => (
                      <option key={b.name} value={b.name}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Project name">
                  <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
                </Field>
              </div>
              {showAdvanced ? (
                <div className="mt-5">
                  <Field label="Root directory" hint="Only for monorepos: the folder that holds this app, e.g. apps/web. Leave blank otherwise.">
                    <input value={rootDir} onChange={(e) => setRootDir(e.target.value)} placeholder="(repository root)" spellCheck={false} className={cn(inputClass, "font-mono text-xs")} />
                  </Field>
                </div>
              ) : (
                <button type="button" onClick={() => setShowAdvanced(true)} className="mt-4 text-xs text-muted transition hover:text-foreground">
                  Is this in a monorepo subfolder?
                </button>
              )}
            </section>
          ) : null}

          {error ? <FormError>{error}</FormError> : null}

          <Button type="submit" disabled={submitting || !ready} className="w-full">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitting ? "Creating…" : "Create project"}
          </Button>
        </GlassCard>

        {/* live preview */}
        <aside className="animate-fade-up lg:col-span-2" style={{ animationDelay: "80ms" }}>
          <div className="lg:sticky lg:top-24">
            <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted">Preview</p>
            <GlassCard innerClassName="relative overflow-hidden p-6">
              <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-accent/20 blur-3xl" />
              <div className="relative">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 font-mono text-lg font-semibold text-accent">
                  {(name || "?").charAt(0).toUpperCase()}
                </span>
                <p className="mt-4 truncate text-base font-semibold">{name || "Your project"}</p>
                <p className="mt-1 flex items-center gap-1.5 truncate font-mono text-xs text-accent/80">
                  <Globe className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                  {projectAddress(slug, chosenServer?.ipAddress) ?? "address assigned on first deploy"}
                </p>
                <dl className="mt-5 space-y-3 border-t border-white/[0.07] pt-5 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="flex items-center gap-1.5 text-muted"><GitBranch className="h-3.5 w-3.5" strokeWidth={1.75} />Source</dt>
                    <dd className="truncate font-mono">{selectedRepo ? `${selectedRepo.fullName}@${branch}` : "—"}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="flex items-center gap-1.5 text-muted"><ServerIcon className="h-3.5 w-3.5" strokeWidth={1.75} />Server</dt>
                    <dd className="truncate">{chosenServer?.name ?? "—"}</dd>
                  </div>
                </dl>
              </div>
            </GlassCard>
            <p className="mt-4 text-xs leading-relaxed text-muted">
              After creating, you&apos;ll add secrets, an optional database, and hit Deploy.
            </p>
          </div>
        </aside>
      </form>
    </Page>
  );
}
