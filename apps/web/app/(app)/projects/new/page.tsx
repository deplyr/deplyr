"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type {
  GithubRepoSummary,
  GithubBranchSummary,
  ServerSummary,
  ProjectSummary,
} from "@argo/shared-types";
import { Button } from "@/components/ui/button";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const inputClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none";

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

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/servers`, { credentials: "include" })
      .then((r) => r.json())
      .then((all: ServerSummary[]) => setServers(all.filter((s) => s.status === "connected")));

    fetch(`${API_URL}/github/repos`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "failed");
        return r.json();
      })
      .then(setRepos)
      .catch(() => setReposError("Could not load your GitHub repos. Try signing in again."));
  }, []);

  useEffect(() => {
    if (!selectedRepo) return;
    setBranches(null);
    setBranch(selectedRepo.defaultBranch);
    setName(selectedRepo.fullName.split("/")[1] ?? selectedRepo.fullName);
    fetch(`${API_URL}/github/repos/${selectedRepo.fullName}/branches`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then(setBranches)
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
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Could not create this project.");
      setSubmitting(false);
      return;
    }

    const project: ProjectSummary = await res.json();
    router.push(`/projects/${project.id}`);
  }

  if (servers && servers.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-8 py-10">
        <h1 className="text-lg font-semibold">New project</h1>
        <p className="mt-2 text-sm text-muted">
          You need a connected server before you can create a project.
        </p>
        <Link href="/servers/new" className="mt-5 inline-block">
          <Button>Connect a server</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-8 py-10">
      <header className="mb-8">
        <h1 className="text-lg font-semibold">New project</h1>
        <p className="mt-1 text-sm text-muted">
          Pick a repo and a server. Argo figures out the framework on its own.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Field label="Server">
          <select
            required
            value={serverId}
            onChange={(e) => setServerId(e.target.value)}
            className={inputClass}
          >
            <option value="" disabled>
              {servers ? "Select a server" : "Loading..."}
            </option>
            {servers?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.ipAddress})
              </option>
            ))}
          </select>
        </Field>

        <Field label="Repository">
          {reposError ? (
            <p className="text-sm text-danger">{reposError}</p>
          ) : selectedRepo ? (
            <div className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2 text-sm">
              <span className="font-mono">{selectedRepo.fullName}</span>
              <button
                type="button"
                onClick={() => setSelectedRepo(null)}
                className="text-xs text-muted hover:text-foreground"
              >
                Change
              </button>
            </div>
          ) : (
            <div>
              <input
                value={repoFilter}
                onChange={(e) => setRepoFilter(e.target.value)}
                placeholder={repos ? "Search your repos..." : "Loading your repos..."}
                className={inputClass}
              />
              {repos ? (
                <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-border">
                  {filteredRepos.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-muted">No repos match.</p>
                  ) : (
                    filteredRepos.map((repo) => (
                      <button
                        type="button"
                        key={repo.fullName}
                        onClick={() => setSelectedRepo(repo)}
                        className="block w-full px-3 py-2 text-left font-mono text-xs text-foreground transition-colors hover:bg-surface-hover"
                      >
                        {repo.fullName}
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          )}
        </Field>

        {selectedRepo ? (
          <>
            <Field label="Branch">
              <select
                required
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className={inputClass}
              >
                {(branches ?? [{ name: selectedRepo.defaultBranch }]).map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Project name">
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
              />
            </Field>
          </>
        ) : null}

        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <Button
          type="submit"
          disabled={submitting || !selectedRepo || !serverId}
          className="w-full"
        >
          {submitting ? "Creating..." : "Create project"}
        </Button>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}
