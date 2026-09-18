const GITHUB_API = "https://api.github.com";

function githubHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "argo-control-plane",
  };
}

interface GithubRepo {
  full_name: string;
  default_branch: string;
  private: boolean;
  updated_at: string;
}

/** First 100 repos, most recently pushed first — see docs/PHASE1_DESIGN.md PR3 notes. */
export async function listRepos(accessToken: string): Promise<GithubRepo[]> {
  const res = await fetch(
    `${GITHUB_API}/user/repos?sort=pushed&per_page=100&affiliation=owner,collaborator`,
    { headers: githubHeaders(accessToken) },
  );
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
  if (!res.ok) throw new Error(`GitHub content fetch failed: ${res.status}`);

  const body = (await res.json()) as { content?: string; encoding?: string };
  if (!body.content || body.encoding !== "base64") return null;
  return Buffer.from(body.content, "base64").toString("utf8");
}
