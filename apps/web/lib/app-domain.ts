import { localAppAddress } from "@deplyr/shared-types";

/**
 * Set only on Cloud (a real domain with wildcard DNS + cert). Unset on a
 * fresh self-hosted instance on purpose — falling back to "deplyr.app"
 * here would point at a domain the self-hoster doesn't own and can't
 * possibly resolve to their own box. Self-host stays on IP addresses
 * until an operator sets this (their own domain) or a project attaches
 * its own custom domain (see components/domains).
 */
export const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || null;

/**
 * A project's default address. With APP_DOMAIN configured (Cloud, or a
 * self-hoster who's set one): "<subdomain>.<domain>". Without one: the
 * server's bare IP — nginx's default_server picks up whichever project
 * without a domain deployed most recently (see
 * apps/agent/src/commands/nginx.ts), so IP access only ever reaches one
 * project at a time until a real domain is configured.
 */
export function projectAddress(subdomain: string, serverIp?: string | null, isLocal = false): string | null {
  // On the box Deplyr itself runs on, Caddy routes every app by hostname (no
  // per-app nginx), so there's no bare-IP fallback: see localAppAddress.
  if (isLocal && serverIp) return localAppAddress(subdomain, serverIp, APP_DOMAIN)?.host ?? serverIp;
  if (APP_DOMAIN) return `${subdomain}.${APP_DOMAIN}`;
  return serverIp ?? null;
}
