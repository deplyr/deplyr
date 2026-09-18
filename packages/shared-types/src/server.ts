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
}
