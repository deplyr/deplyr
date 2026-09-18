import { z } from "zod";

export const databaseTypeSchema = z.enum(["postgres"]);
export type DatabaseType = z.infer<typeof databaseTypeSchema>;

export const databaseStatusSchema = z.enum(["provisioning", "running", "error"]);
export type DatabaseStatus = z.infer<typeof databaseStatusSchema>;

/** What GET/POST /projects/:id/databases returns. */
export interface DatabaseSummary {
  id: string;
  type: DatabaseType;
  status: DatabaseStatus;
  connectionSecretKey: string;
  createdAt: string;
}
