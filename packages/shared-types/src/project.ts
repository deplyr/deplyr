import { z } from "zod";

export const frameworkSchema = z.enum(["nextjs", "nestjs", "node", "dockerfile"]);
export type Framework = z.infer<typeof frameworkSchema>;

export const packageManagerSchema = z.enum(["npm", "pnpm", "yarn", "bun"]);
export type PackageManager = z.infer<typeof packageManagerSchema>;

export const NODE_VERSIONS = ["18", "20", "22"] as const;
export const nodeVersionSchema = z.enum(NODE_VERSIONS);
export type NodeVersion = z.infer<typeof nodeVersionSchema>;

/** A folder inside the repo: relative, no "..", no leading slash. Empty = repo root. */
const relativePath = z
  .string()
  .max(200)
  .refine((p) => !p.startsWith("/") && !p.split("/").includes("..") && !/[\s"'`$;&|<>\\]/.test(p), "must be a plain relative path");

/**
 * How a project is built and run. Every field is optional: what's missing is
 * filled from the framework + package manager (see resolveBuildPlan), so a
 * project that never opens Settings still gets sensible behaviour.
 *
 * For the three commands, `undefined` means "use the default" and an empty
 * string means "skip this step" — e.g. a plain Express app with no build script.
 */
export const projectSettingsSchema = z.object({
  rootDir: relativePath.optional(),
  packageManager: packageManagerSchema.optional(),
  nodeVersion: nodeVersionSchema.optional(),
  installCommand: z.string().max(500).optional(),
  buildCommand: z.string().max(500).optional(),
  startCommand: z.string().max(500).optional(),
  healthCheckPath: z.string().regex(/^\/[^\s]*$/, "must start with /").max(200).optional(),
  dockerfilePath: relativePath.optional(),
});
export type ProjectSettings = z.infer<typeof projectSettingsSchema>;

/** PUT /projects/:id/settings */
export const updateProjectSettingsInputSchema = z.object({
  framework: frameworkSchema.optional(),
  settings: projectSettingsSchema,
});
export type UpdateProjectSettingsInput = z.infer<typeof updateProjectSettingsInputSchema>;

/** What looking at a repo found — returned by detection, never stored as-is. */
export interface DetectionResult {
  framework: Framework | null;
  settings: ProjectSettings;
  hasDockerfile: boolean;
  hasPackageJson: boolean;
  /** Human-readable observations: "Found pnpm-lock.yaml", "Nest apps must listen on $PORT"… */
  notes: string[];
}

export const projectStatusSchema = z.enum([
  "created",
  "deploying",
  "live",
  "failed",
]);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

export const createProjectInputSchema = z.object({
  serverId: z.string().uuid(),
  name: z.string().min(1).max(100),
  githubRepo: z.string().regex(/^[^/\s]+\/[^/\s]+$/, "expected \"owner/repo\""),
  githubBranch: z.string().min(1).default("main"),
  /** For monorepos: the folder holding the app. Empty/omitted = repo root. */
  rootDir: relativePath.optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;

/** Payload for PATCH /projects/:id — a rename. Build settings, branch and
 * root directory are changed separately, via PUT /projects/:id/settings. */
export const updateProjectInputSchema = z.object({
  name: z.string().min(1).max(100),
});
export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;

/** What GET/POST /projects returns — dates arrive as ISO strings over JSON. */
export interface ProjectSummary {
  id: string;
  name: string;
  subdomain: string; // slug only — a self-hosted instance's base domain varies
  githubRepo: string;
  githubBranch: string;
  framework: Framework | null; // null means detection failed — "not supported yet"
  settings: ProjectSettings;
  /** The port the app listens on, on its server (null until the first deploy assigns one). */
  appPort: number | null;
  /** Live HTTPS status of the free <subdomain>.<appDomain> address. */
  defaultDomainHttps: boolean;
  defaultDomainCheckedAt: string | null;
  status: ProjectStatus;
  serverId: string;
  createdAt: string;
}
