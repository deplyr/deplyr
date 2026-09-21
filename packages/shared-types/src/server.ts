import { z } from "zod";

export const serverStatusSchema = z.enum([
  "pending",
  "installing",
  "connected",
  "error",
]);
export type ServerStatus = z.infer<typeof serverStatusSchema>;

export const sshCredentialTypeSchema = z.enum(["password", "private_key"]);
export type SshCredentialType = z.infer<typeof sshCredentialTypeSchema>;

/** Payload for POST /servers — what the UI submits to register a VPS. */
export const registerServerInputSchema = z.object({
  name: z.string().min(1).max(100),
  ipAddress: z.string().ip(),
  credentialType: sshCredentialTypeSchema,
  credential: z.string().min(1), // root password, or a PEM private key
});
export type RegisterServerInput = z.infer<typeof registerServerInputSchema>;

/** What GET/POST /servers returns — dates arrive as ISO strings over JSON. */
export interface ServerSummary {
  id: string;
  name: string;
  ipAddress: string;
  status: ServerStatus;
  statusDetail: string | null;
  dockerInstalled: boolean;
  agentConnectedAt: string | null;
  createdAt: string;
  /** Latest heartbeat snapshot — null until the agent's first heartbeat. */
  cpuPercent: number | null;
  memPercent: number | null;
  diskPercent: number | null;
  metricsUpdatedAt: string | null;
  cpuCores: number | null;
  memTotalMb: number | null;
  diskTotalGb: number | null;
  uptimeSeconds: number | null;
  loadAvg1: number | null;
}

export const METRICS_RANGES = ["1h", "6h", "24h", "7d"] as const;
export const metricsRangeSchema = z.enum(METRICS_RANGES);
export type MetricsRange = z.infer<typeof metricsRangeSchema>;

/**
 * One time bucket of the history chart. The plotted line is the bucket
 * average; `*Max` keeps the worst sample so a 7-day view can't hide a spike
 * behind smoothing.
 */
export interface MetricsPoint {
  t: string; // ISO timestamp of the bucket start
  cpu: number;
  mem: number;
  disk: number;
  load: number | null;
  cpuMax: number;
  memMax: number;
  diskMax: number;
  loadMax: number | null;
}

/** What GET /servers/:id/metrics returns. */
export interface ServerMetricsHistory {
  range: MetricsRange;
  bucketSeconds: number;
  points: MetricsPoint[];
}
