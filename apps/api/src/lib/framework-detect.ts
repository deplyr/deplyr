import {
  DEFAULT_NODE_VERSION,
  NODE_VERSIONS,
  runScript,
  type DetectionResult,
  type NodeVersion,
  type PackageManager,
  type ProjectSettings,
} from "@deplyr/shared-types";
import { getFileContent, listDirectory } from "./github";

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  main?: string;
  packageManager?: string;
  engines?: { node?: string };
}

/** Everything analysis needs, already fetched — so it can be tested without GitHub. */
export interface RepoSnapshot {
  rootDir: string;
  /** Names of the entries in the (sub)folder being deployed. */
  files: ReadonlyMap<string, "file" | "dir" | "symlink" | "submodule">;
  packageJson: PackageJson | null;
  /** Raw text of .nvmrc / .node-version, if either exists. */
  nvmrc: string | null;
  dockerfile: string | null;
}

// ---------------------------------------------------------------------------
// small parsers
// ---------------------------------------------------------------------------

/** "pnpm@9.1.0+sha…" -> "pnpm" */
export function packageManagerFromField(field: string | undefined): PackageManager | null {
  const name = field?.split("@")[0];
  return name === "npm" || name === "pnpm" || name === "yarn" || name === "bun" ? name : null;
}

export function pickPackageManager(files: RepoSnapshot["files"], pkg: PackageJson | null): { pm: PackageManager; why: string } {
  const declared = packageManagerFromField(pkg?.packageManager);
  if (declared) return { pm: declared, why: `package.json declares ${pkg?.packageManager}` };
  if (files.has("pnpm-lock.yaml")) return { pm: "pnpm", why: "found pnpm-lock.yaml" };
  if (files.has("yarn.lock")) return { pm: "yarn", why: "found yarn.lock" };
  if (files.has("bun.lockb") || files.has("bun.lock")) return { pm: "bun", why: "found a bun lockfile" };
  if (files.has("package-lock.json")) return { pm: "npm", why: "found package-lock.json" };
  return { pm: "npm", why: "no lockfile found, defaulting to npm" };
}

/** Pick the supported Node major that best matches what the repo asks for. */
export function pickNodeVersion(nvmrc: string | null, enginesNode: string | undefined): { version: NodeVersion; why: string | null } {
  const supported = NODE_VERSIONS.map(Number);
  const newest = supported[supported.length - 1]!;
  const fallback = { version: DEFAULT_NODE_VERSION, why: null };

  const fromNvmrc = nvmrc?.trim().replace(/^v/i, "");
  const raw = fromNvmrc && /^\d/.test(fromNvmrc) ? fromNvmrc : enginesNode?.trim();
  if (!raw) return fallback;

  const major = Number(/(\d+)/.exec(raw)?.[1]);
  if (!Number.isFinite(major)) return fallback;

  const source = fromNvmrc && /^\d/.test(fromNvmrc) ? ".nvmrc" : "engines.node";
  // ">=18" means "18 or newer" — the default is fine if it satisfies that.
  const atLeast = /^>=?\s*\d/.test(raw) && !raw.includes("||") && !raw.includes("<");
  const target = atLeast ? Math.max(major, Number(DEFAULT_NODE_VERSION)) : major;

  const chosen = supported.find((v) => v >= target) ?? newest;
  const version = String(chosen) as NodeVersion;
  return { version, why: `${source} asks for Node ${raw}, using ${version}` };
}

// ---------------------------------------------------------------------------
// analysis
// ---------------------------------------------------------------------------

export function analyzeRepo(snap: RepoSnapshot): DetectionResult {
  const notes: string[] = [];
  const hasDockerfile = snap.files.has("Dockerfile");
  const pkg = snap.packageJson;
  const settings: ProjectSettings = {};
  if (snap.rootDir) settings.rootDir = snap.rootDir;

  const dockerNote = () => {
    const expose = snap.dockerfile ? /^\s*EXPOSE\s+(\d+)/im.exec(snap.dockerfile)?.[1] : undefined;
    const readsPort = snap.dockerfile ? /\bPORT\b/.test(snap.dockerfile) : false;
    notes.push(
      expose && !readsPort
        ? `Deplyr sets the PORT variable for your app. Your Dockerfile exposes ${expose} — make sure the app listens on $PORT, or it won't be reachable.`
        : "Your app must listen on the PORT environment variable.",
    );
  };

  if (!pkg) {
    if (hasDockerfile) {
      notes.push("Found a Dockerfile — Deplyr will build and run it.");
      dockerNote();
      return { framework: "dockerfile", settings, hasDockerfile, hasPackageJson: false, notes };
    }
    const hasWorkspaces = ["apps", "packages", "services"].some((d) => snap.files.get(d) === "dir");
    notes.push(
      hasWorkspaces && !snap.rootDir
        ? "This looks like a monorepo. Set the root directory to the folder holding the app (for example apps/web)."
        : "No package.json or Dockerfile found here, so there's nothing Deplyr knows how to run.",
    );
    return { framework: null, settings, hasDockerfile, hasPackageJson: false, notes };
  }

  const { pm, why: pmWhy } = pickPackageManager(snap.files, pkg);
  settings.packageManager = pm;
  notes.push(`Using ${pm} (${pmWhy}).`);

  const node = pickNodeVersion(snap.nvmrc, pkg.engines?.node);
  settings.nodeVersion = node.version;
  if (node.why) notes.push(node.why + ".");

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const scripts = pkg.scripts ?? {};

  if ("next" in deps) {
    if (hasDockerfile) notes.push("A Dockerfile was also found — you can switch to it in build settings.");
    return { framework: "nextjs", settings, hasDockerfile, hasPackageJson: true, notes };
  }

  if ("@nestjs/core" in deps) {
    // Respect the project's own production script when it has one — in a Nest
    // monorepo the compiled entry point isn't dist/main.
    if (scripts["start:prod"]) settings.startCommand = runScript(pm, "start:prod");
    notes.push("NestJS apps should listen on the PORT variable: app.listen(process.env.PORT ?? 3000).");
    if (hasDockerfile) notes.push("A Dockerfile was also found — you can switch to it in build settings.");
    return { framework: "nestjs", settings, hasDockerfile, hasPackageJson: true, notes };
  }

  if (scripts.start || pkg.main) {
    // Plain Node has no built-in build step, so write down explicitly what
    // exists: run the build script if there is one, skip the step if not.
    settings.buildCommand = scripts.build ? runScript(pm, "build") : "";
    if (!scripts.start && pkg.main) settings.startCommand = `node ${pkg.main}`;
    notes.push("Your app must listen on the PORT environment variable.");
    if (hasDockerfile) notes.push("A Dockerfile was also found — you can switch to it in build settings.");
    return { framework: "node", settings, hasDockerfile, hasPackageJson: true, notes };
  }

  if (hasDockerfile) {
    notes.push("No start script in package.json, but there's a Dockerfile — Deplyr will build and run that.");
    dockerNote();
    return { framework: "dockerfile", settings: snap.rootDir ? { rootDir: snap.rootDir } : {}, hasDockerfile, hasPackageJson: true, notes };
  }

  notes.push('Add a "start" script to package.json so Deplyr knows how to run your app.');
  return { framework: null, settings, hasDockerfile, hasPackageJson: true, notes };
}

// ---------------------------------------------------------------------------
// GitHub-backed entry point
// ---------------------------------------------------------------------------

export async function detectProject(
  accessToken: string,
  owner: string,
  repo: string,
  ref: string,
  rootDir = "",
): Promise<DetectionResult> {
  const cleanRoot = rootDir.replace(/^\/+|\/+$/g, "");
  const entries = await listDirectory(accessToken, owner, repo, cleanRoot, ref);
  if (entries === null) {
    return {
      framework: null,
      settings: {},
      hasDockerfile: false,
      hasPackageJson: false,
      notes: [`The folder "${cleanRoot}" doesn't exist in ${owner}/${repo} on ${ref}.`],
    };
  }

  const files = new Map(entries.map((e) => [e.name, e.type] as const));
  const at = (name: string) => (cleanRoot ? `${cleanRoot}/${name}` : name);
  const read = (name: string) => (files.has(name) ? getFileContent(accessToken, owner, repo, at(name), ref) : Promise.resolve(null));

  const [pkgRaw, nvmrc, nodeVersionFile, dockerfile] = await Promise.all([
    read("package.json"),
    read(".nvmrc"),
    read(".node-version"),
    read("Dockerfile"),
  ]);

  let packageJson: PackageJson | null = null;
  if (pkgRaw) {
    try {
      packageJson = JSON.parse(pkgRaw) as PackageJson;
    } catch {
      packageJson = null;
    }
  }

  return analyzeRepo({ rootDir: cleanRoot, files, packageJson, nvmrc: nvmrc ?? nodeVersionFile, dockerfile });
}
