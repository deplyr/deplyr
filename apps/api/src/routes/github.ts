import { Hono } from "hono";
import type { GithubRepoSummary, GithubBranchSummary } from "@deplyr/shared-types";
import { requireAuth } from "../lib/require-auth";
import { getUserGithubToken } from "../lib/user-github-token";
import { listRepos, listBranches } from "../lib/github";
import type { AppEnv } from "../types";

export const githubRoute = new Hono<AppEnv>();
githubRoute.use("*", requireAuth);

githubRoute.get("/repos", async (c) => {
  const token = await getUserGithubToken(c.get("userId"));
  if (!token) return c.json({ error: "no GitHub token on file — sign in again" }, 400);

  try {
    const repos = await listRepos(token);
    const body: GithubRepoSummary[] = repos.map((r) => ({
      fullName: r.full_name,
      defaultBranch: r.default_branch,
      private: r.private,
      updatedAt: r.updated_at,
    }));
    return c.json(body);
  } catch {
    return c.json({ error: "could not reach GitHub — try again in a moment" }, 502);
  }
});

githubRoute.get("/repos/:owner/:repo/branches", async (c) => {
  const token = await getUserGithubToken(c.get("userId"));
  if (!token) return c.json({ error: "no GitHub token on file — sign in again" }, 400);

  try {
    const branches = await listBranches(token, c.req.param("owner"), c.req.param("repo"));
    const body: GithubBranchSummary[] = branches.map((b) => ({ name: b.name }));
    return c.json(body);
  } catch {
    return c.json({ error: "could not reach GitHub — try again in a moment" }, 502);
  }
});
