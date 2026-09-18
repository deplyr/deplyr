import { z } from "zod";
import { deployStepNameSchema } from "./deploy";

/**
 * Wire protocol for the single persistent WebSocket connection between the
 * control plane (apps/api) and an agent running on a managed server. The
 * agent always dials out — see docs/PHASE1_DESIGN.md section 3.
 */

// ---- agent -> control plane: auth handshake (first message on connect) ----
export const agentAuthSchema = z.object({
  type: z.literal("auth"),
  serverId: z.string().uuid(),
  token: z.string().min(32),
});
export type AgentAuth = z.infer<typeof agentAuthSchema>;

// ---- control plane -> agent: commands ----
// Phase 1 only ever sends "deploy.<step>" commands; the `name` field stays a
// plain string (rather than a closed enum) since later PRs add non-deploy
// commands (e.g. "db.provisionPostgres") without changing this schema.
export const deployCommandNames = deployStepNameSchema.options.map(
  (step) => `deploy.${step}` as const,
);

export const commandSchema = z.object({
  type: z.literal("command"),
  requestId: z.string().uuid(),
  name: z.string(), // e.g. "deploy.clone", "db.provisionPostgres" (Phase 1: deploy.* only, wider set lands in later PRs)
  payload: z.record(z.string(), z.unknown()).default({}),
});
export type Command = z.infer<typeof commandSchema>;

// ---- agent -> control plane: streamed events for a command ----
export const logEventSchema = z.object({
  type: z.literal("log"),
  requestId: z.string().uuid(),
  line: z.string(),
});
export type LogEvent = z.infer<typeof logEventSchema>;

export const resultEventSchema = z.object({
  type: z.literal("result"),
  requestId: z.string().uuid(),
  status: z.enum(["success", "failure"]),
  detail: z.string().optional(),
});
export type ResultEvent = z.infer<typeof resultEventSchema>;

// ---- agent -> control plane: periodic liveness + metrics ----
export const heartbeatEventSchema = z.object({
  type: z.literal("heartbeat"),
  cpuPercent: z.number().min(0).max(100),
  memPercent: z.number().min(0).max(100),
  diskPercent: z.number().min(0).max(100),
});
export type HeartbeatEvent = z.infer<typeof heartbeatEventSchema>;

export const agentEventSchema = z.discriminatedUnion("type", [
  logEventSchema,
  resultEventSchema,
  heartbeatEventSchema,
]);
export type AgentEvent = z.infer<typeof agentEventSchema>;

export const controlPlaneMessageSchema = commandSchema;
export type ControlPlaneMessage = z.infer<typeof controlPlaneMessageSchema>;
