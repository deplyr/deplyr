import { z } from "zod";

export const frameworkSchema = z.enum(["nextjs", "node"]);
export type Framework = z.infer<typeof frameworkSchema>;

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
});
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;

/** What GET/POST /projects returns — dates arrive as ISO strings over JSON. */
export interface ProjectSummary {
  id: string;
  name: string;
  subdomain: string; // slug only — a self-hosted instance's base domain varies
  githubRepo: string;
  githubBranch: string;
  framework: Framework | null; // null means detection failed — "not supported yet"
  status: ProjectStatus;
  serverId: string;
  createdAt: string;
}
