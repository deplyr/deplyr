import { Hono } from "hono";
import type { GithubRepoSummary, GithubBranchSummary } from "@deplyr/shared-types";
import { requireAuth } from "../lib/require-auth";
import { getUserGithubToken } from "../lib/user-github-token";
import { listRepos, listBranches, GithubAuthError } from "../lib/github";
import { detectProject } from "../lib/framework-detect";
import { invalidateGithubSession } from "../lib/github-auth-guard";
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
  } catch (err) {
    if (err instanceof GithubAuthError) return invalidateGithubSession(c, c.get("userId"));
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
  } catch (err) {
    if (err instanceof GithubAuthError) return invalidateGithubSession(c, c.get("userId"));
    return c.json({ error: "could not reach GitHub — try again in a moment" }, 502);
  }
});

// Pre-creation detection, so the "new project" form can surface a monorepo
// hint (and the right root directory) before the project even exists — the
// same analysis /projects/:id/detect runs afterwards.
githubRoute.get("/repos/:owner/:repo/detect", async (c) => {
  const token = await getUserGithubToken(c.get("userId"));
  if (!token) return c.json({ error: "no GitHub token on file — sign in again" }, 400);

  const branch = c.req.query("branch");
  if (!branch) return c.json({ error: "branch is required" }, 400);
  const rootDir = c.req.query("rootDir") ?? "";

  try {
    const result = await detectProject(token, c.req.param("owner"), c.req.param("repo"), branch, rootDir);
    return c.json(result);
  } catch (err) {
    if (err instanceof GithubAuthError) return invalidateGithubSession(c, c.get("userId"));
    return c.json({ error: "could not reach GitHub — try again in a moment" }, 502);
  }
});
