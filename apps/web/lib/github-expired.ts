/**
 * The API found the stored GitHub token dead (revoked, or auto-revoked as a
 * leaked secret) and, as a side effect, cleared the GitHub link and ended
 * the session (see invalidateGithubSession in the API). A hard redirect —
 * not router.push — because the session cookie is already gone: this isn't
 * client nav to a page the app still thinks it's signed into, it's an
 * actual sign-out.
 *
 * Call at the top of a failed-response handler for anything that hits a
 * GitHub-backed endpoint; returns true if it redirected, so the caller can
 * skip rendering its own error state.
 */
export function handleGithubExpired(body: unknown): boolean {
  if ((body as { error?: string } | null)?.error !== "github_expired") return false;
  window.location.href = "/login";
  return true;
}
