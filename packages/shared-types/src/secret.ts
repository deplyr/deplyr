import { z } from "zod";

export const secretSourceSchema = z.enum(["user", "system"]);
export type SecretSource = z.infer<typeof secretSourceSchema>;

/** Never carries the decrypted value — see GET /projects/:id/secrets. */
export interface SecretSummary {
  key: string;
  hasValue: boolean;
  source: SecretSource;
}

export const upsertSecretsInputSchema = z.object({
  secrets: z
    .array(z.object({ key: z.string().min(1), value: z.string() }))
    .min(1),
});
export type UpsertSecretsInput = z.infer<typeof upsertSecretsInputSchema>;
