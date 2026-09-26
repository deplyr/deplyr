import { z } from "zod";
import type { DomainSslStatus } from "./domain";

// Empty/omitted clears the custom domain — the instance falls back to
// serving only its bare IP/host (DEPLYR_PUBLIC_HOST).
export const updateInstanceDomainSchema = z.object({
  hostname: z.string().trim().max(253).optional(),
});
export type UpdateInstanceDomainInput = z.infer<typeof updateInstanceDomainSchema>;

/** The control plane's own address(es) — not a project's. Set from Settings
 * instead of DEPLYR_PUBLIC_HOST + a manual rebuild, once the instance is
 * already up. See packages/db/src/schema.ts's instanceSettings for the
 * stored half of this. */
export interface InstanceSettingsDTO {
  /** Always reachable, in addition to any custom domain below. */
  publicHost: string;
  customDomain: string | null;
  domainStatus: DomainSslStatus;
  domainStatusDetail: string | null;
}
