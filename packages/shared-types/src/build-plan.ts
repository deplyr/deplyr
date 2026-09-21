import type { Framework, NodeVersion, PackageManager, ProjectSettings } from "./project";

/**
 * Turns "what kind of project is this + what did the user configure" into
 * concrete commands. Pure and dependency-free on purpose: the worker uses it
 * to build the agent's payloads, the settings page uses it to show what will
 * actually run — both must agree, so there is exactly one implementation.
 */

export interface BuildPlan {
  mode: "auto" | "dockerfile";
  /** Folder inside the repo the commands run in ("" = repo root). */
  rootDir: string;
  /** Runtime image for auto mode (unused for Dockerfile projects). */
  image: string;
  packageManager: PackageManager;
  nodeVersion: NodeVersion;
  /** null = skip the step. */
  install: string | null;
  build: string | null;
  start: string;
  healthCheckPath: string;
  dockerfilePath: string;
}

export const DEFAULT_NODE_VERSION: NodeVersion = "20";

const corepack = (pm: PackageManager) => (pm === "pnpm" || pm === "yarn" ? "corepack enable && " : "");

function defaultInstall(pm: PackageManager): string {
  switch (pm) {
    case "npm":
      // `npm ci` is faster and exact, but errors without a lockfile.
      return "if [ -f package-lock.json ]; then npm ci; else npm install; fi";
    case "pnpm":
      return "corepack enable && pnpm install";
    case "yarn":
      return "corepack enable && yarn install";
    case "bun":
      return "bun install";
  }
}

/** `<pm> run <script>`, with corepack enabled first where the pm needs it. */
export const runScript = (pm: PackageManager, script: string) => `${corepack(pm)}${pm} run ${script}`;
const run = runScript;

export function defaultStart(framework: Framework | null, pm: PackageManager): string {
  // Nest's compiled entry point is a convention, not a package manager
  // concern — `node dist/main` works the same whichever tool installed it.
  if (framework === "nestjs") return "node dist/main";
  return run(pm, "start");
}

/** Merge a project's stored settings over the defaults for its framework. */
export function resolveBuildPlan(framework: Framework | null, settings: ProjectSettings | null | undefined): BuildPlan {
  const s = settings ?? {};
  const pm = s.packageManager ?? "npm";
  const nodeVersion = s.nodeVersion ?? DEFAULT_NODE_VERSION;
  const dockerMode = framework === "dockerfile";

  // undefined -> default, "" -> skip, anything else -> as written.
  const pick = (value: string | undefined, fallback: string | null): string | null =>
    value === undefined ? fallback : value.trim() === "" ? null : value.trim();

  const needsBuildStep = framework === "nextjs" || framework === "nestjs";

  return {
    mode: dockerMode ? "dockerfile" : "auto",
    rootDir: s.rootDir ?? "",
    image: pm === "bun" ? "oven/bun:1" : `node:${nodeVersion}-slim`,
    packageManager: pm,
    nodeVersion,
    install: dockerMode ? null : pick(s.installCommand, defaultInstall(pm)),
    // Plain Node apps often have no build script; detection writes "" for
    // those. With no detection result at all, don't invent one.
    build: dockerMode ? null : pick(s.buildCommand, needsBuildStep ? run(pm, "build") : null),
    start: pick(s.startCommand, defaultStart(framework, pm)) ?? defaultStart(framework, pm),
    healthCheckPath: s.healthCheckPath ?? "/",
    dockerfilePath: s.dockerfilePath ?? "Dockerfile",
  };
}
