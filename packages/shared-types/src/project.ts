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
