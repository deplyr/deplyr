const GITHUB_API = "https://api.github.com";

/**
 * The stored token itself is dead — revoked on GitHub's side, or
 * auto-revoked as a leaked secret. Distinct from every other failure mode
 * (repo renamed, rate limited, network blip) so callers can react to it
 * specifically instead of showing a generic "couldn't read GitHub" error.
 */
export class GithubAuthError extends Error {
  constructor() {
    super("GitHub token is no longer valid");
  }
}

function checkAuth(res: Response) {
  if (res.status === 401) throw new GithubAuthError();
}

function githubHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "deplyr-control-plane",
  };
}

interface GithubRepo {
  full_name: string;
  default_branch: string;
  private: boolean;
  updated_at: string;
}

/** First 100 repos, most recently pushed first — see docs/architecture.md PR3 notes. */
export async function listRepos(accessToken: string): Promise<GithubRepo[]> {
  const res = await fetch(
    `${GITHUB_API}/user/repos?sort=pushed&per_page=100&affiliation=owner,collaborator`,
    { headers: githubHeaders(accessToken) },
  );
  checkAuth(res);
  if (!res.ok) throw new Error(`GitHub repo list failed: ${res.status}`);
  return (await res.json()) as GithubRepo[];
}

interface GithubBranch {
  name: string;
}

export async function listBranches(
  accessToken: string,
  owner: string,
  repo: string,
): Promise<GithubBranch[]> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/branches?per_page=100`,
    { headers: githubHeaders(accessToken) },
  );
  checkAuth(res);
  if (!res.ok) throw new Error(`GitHub branch list failed: ${res.status}`);
  return (await res.json()) as GithubBranch[];
}

/** Raw text content of a file at a given ref, or null if it doesn't exist. */
export async function getFileContent(
  accessToken: string,
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<string | null> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`,
    { headers: githubHeaders(accessToken) },
  );
  if (res.status === 404) return null;
  checkAuth(res);
  if (!res.ok) throw new Error(`GitHub content fetch failed: ${res.status}`);

  const body = (await res.json()) as { content?: string; encoding?: string };
  if (!body.content || body.encoding !== "base64") return null;
  return Buffer.from(body.content, "base64").toString("utf8");
}

export interface GithubDirEntry {
  name: string;
  type: "file" | "dir" | "symlink" | "submodule";
}

/** Entries of a directory at a ref ("" = repo root), or null if it isn't one. */
export async function listDirectory(
  accessToken: string,
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<GithubDirEntry[] | null> {
  const clean = path.replace(/^\/+|\/+$/g, "");
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents${clean ? `/${clean}` : ""}?ref=${encodeURIComponent(ref)}`,
    { headers: githubHeaders(accessToken) },
  );
  if (res.status === 404) return null;
  checkAuth(res);
  if (!res.ok) throw new Error(`GitHub directory listing failed: ${res.status}`);

  const body = (await res.json()) as unknown;
  // A file path returns a single object instead of an array.
  return Array.isArray(body) ? (body as GithubDirEntry[]) : null;
}
