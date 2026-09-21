import { z } from "zod";

export interface AuthUser {
  id: string;
  email: string;
  githubLogin: string | null;
}

export const credentialsInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type CredentialsInput = z.infer<typeof credentialsInputSchema>;
