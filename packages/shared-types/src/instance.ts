import { z } from "zod";
import type { DomainSslStatus } from "./domain";

// Empty/omitted clears the custom domain — the instance falls back to
// serving only its bare IP/host (DEPLYR_PUBLIC_HOST).
export const updateInstanceDomainSchema = z.object({
  hostname: z.string().trim().max(253).optional(),
});
export type UpdateInstanceDomainInput = z.infer<typeof updateInstanceDomainSchema>;

/** Where a just-added domain is in going live. Worked out fresh on every
 * read (DNS lookup + a TLS handshake with Caddy), not stored — it changes
 * on its own as DNS propagates and the certificate gets issued. */
export type InstanceDomainState =
  /** No A record for the domain visible yet. */
  | "waiting_dns"
  /** The domain resolves, but somewhere other than this server. */
  | "wrong_dns"
  /** DNS is right; Caddy is still getting the HTTPS certificate. */
  | "issuing_cert"
  /** Resolves here and serves a valid certificate. */
  | "active";

export interface InstanceDomainCheck {
  state: InstanceDomainState;
  /** What the domain's A record currently resolves to. */
  resolvedIps: string[];
  /** What it should resolve to — this server's public IP. */
  expectedIps: string[];
}

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
  /** Null when there's no custom domain. */
  check: InstanceDomainCheck | null;
}
