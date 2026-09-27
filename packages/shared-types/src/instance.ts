import { z } from "zod";
import type { DomainSslStatus } from "./domain";

// Empty/omitted clears the custom domain — the instance falls back to
// serving only its bare IP/host (DEPLYR_PUBLIC_HOST).
export const updateInstanceDomainSchema = z.object({
  hostname: z.string().trim().max(253).optional(),
});
export type UpdateInstanceDomainInput = z.infer<typeof updateInstanceDomainSchema>;

// Empty/omitted clears the override and falls back to DEPLYR_PUBLIC_HOST.
export const updateInstanceHostSchema = z.object({
  host: z.string().trim().max(253).optional(),
});
export type UpdateInstanceHostInput = z.infer<typeof updateInstanceHostSchema>;

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
  /** Always reachable, in addition to any custom domain below. Effective
   * value — the Settings override if one's set, else DEPLYR_PUBLIC_HOST. */
  publicHost: string;
  /** Whether `publicHost` above came from Settings rather than the env var. */
  publicHostIsOverridden: boolean;
  /** What DEPLYR_PUBLIC_HOST itself is set to, for the "reset" case — null
   * when it's unset (a fresh instance, or local dev). */
  envPublicHost: string | null;
  customDomain: string | null;
  domainStatus: DomainSslStatus;
  domainStatusDetail: string | null;
  /** Null when there's no custom domain. */
  check: InstanceDomainCheck | null;
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const HOSTNAME_LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;

export interface PublicHostCheck {
  ok: boolean;
  error?: string;
  normalized?: string;
}

/**
 * What this instance answers to when nothing else is configured — almost
 * always a bare IP (the common case for a self-hosted box with no domain
 * yet), sometimes a hostname. Deliberately more permissive than a project's
 * custom domain check (checkHostnameFormat, which rejects bare IPs and
 * single labels outright): this is the operator's own infrastructure, not
 * something to guard against collisions on.
 */
export function checkPublicHostFormat(input: string): PublicHostCheck {
  const trimmed = input.trim().toLowerCase().replace(/\.$/, "");
  if (!trimmed) return { ok: false, error: "Enter an address." };
  if (trimmed.length > 253) return { ok: false, error: "That's too long to be a valid address." };
  if (IPV4.test(trimmed)) {
    if (trimmed.split(".").some((octet) => Number(octet) > 255)) {
      return { ok: false, error: "That doesn't look like a valid IP address." };
    }
    return { ok: true, normalized: trimmed };
  }
  if (!trimmed.split(".").every((label) => HOSTNAME_LABEL.test(label))) {
    return { ok: false, error: "That doesn't look like a valid address." };
  }
  return { ok: true, normalized: trimmed };
}

/**
 * The hostname an app on the box Deplyr itself runs on is served at. Caddy is
 * the one front door on 80/443 there (there's no per-app nginx on that box),
 * so every app needs a hostname to be routed by:
 *
 *  - with an operator-set DEPLYR_APP_DOMAIN: `<slug>.<that domain>`, over
 *    HTTPS (Caddy issues the certificate — their wildcard DNS has to point
 *    here);
 *  - otherwise, on a bare IP: `<slug>.<ip-with-dashes>.sslip.io` — sslip.io
 *    is a public wildcard DNS service that resolves any such name to the IP
 *    inside it, so an app gets a working address without anyone owning a
 *    domain. Served over HTTP: those names all share one Let's Encrypt
 *    rate limit, so issuing certificates for them isn't something to do
 *    behind someone's back;
 *  - a domain as the public host with no app domain: no address (that needs
 *    wildcard DNS Deplyr can't assume).
 */
export function localAppAddress(
  slug: string,
  publicHost: string,
  appDomain?: string | null,
): { host: string; https: boolean } | null {
  if (appDomain) return { host: `${slug}.${appDomain}`, https: true };
  if (IPV4.test(publicHost)) return { host: `${slug}.${publicHost.replace(/\./g, "-")}.sslip.io`, https: false };
  return null;
}
