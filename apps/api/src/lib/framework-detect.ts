import type { Framework } from "@argo/shared-types";
import { getFileContent } from "./github";

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

/**
 * Phase 1 supports exactly Next.js and plain Node — see
 * docs/PHASE1_DESIGN.md PR3 notes. Reads package.json via GitHub's Contents
 * API rather than a real git clone: same detection signal, no disk or git
 * binary needed on the control plane.
 *
 * Returns null when nothing recognizable is found — the caller surfaces
 * that as "not supported yet" rather than attempting a deploy.
 */
export async function detectFramework(
  accessToken: string,
  owner: string,
  repo: string,
  ref: string,
): Promise<Framework | null> {
  const raw = await getFileContent(accessToken, owner, repo, "package.json", ref);
  if (!raw) return null;

  let pkg: PackageJson;
  try {
    pkg = JSON.parse(raw);
  } catch {
    return null;
  }

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if ("next" in deps) return "nextjs";
  if (pkg.scripts?.build && pkg.scripts?.start) return "node";
  return null;
}
