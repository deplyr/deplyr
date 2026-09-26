import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { localAppAddress } from "@deplyr/shared-types";
import { db } from "./client";
import { domains, instanceSettings, projects } from "./schema";

// Reachable over the internal Docker network only (never published to the
// host — see infra/docker/docker-compose.prod.yml).
export const CADDY_ADMIN_URL = process.env.CADDY_ADMIN_URL ?? "http://caddy:2019";

/** Must match the static Caddyfile's global block: /load replaces the whole
 * config, so without it Caddy falls back to a localhost-only admin API and
 * nothing can reach it again. */
const ADMIN_BLOCK = `{\n\tadmin 0.0.0.0:2019 {\n\t\torigins caddy:2019 localhost:2019 127.0.0.1:2019\n\t}\n}\n`;

// A bare IP needs an explicit http:// — Caddy otherwise self-signs it and
// redirects to a port that's usually closed (see infra/docker/Caddyfile).
const address = (host: string) => (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) ? `http://${host}` : host);

/** One app on the box Deplyr runs on, and where its container listens. The
 * app runs with host networking, so from Caddy's container it's reached via
 * the host gateway (host.docker.internal — see the compose file). */
export interface CaddyApp {
  host: string;
  https: boolean;
  port: number;
}

/** Apps deployed to the local server, with the hostname each is served at. */
export async function localApps(): Promise<CaddyApp[]> {
  const localId = process.env.DEPLYR_LOCAL_SERVER_ID;
  const publicHost = process.env.DEPLYR_PUBLIC_HOST;
  if (!localId || !publicHost) return [];
  const rows = await db
    .select({ subdomain: projects.subdomain, appPort: projects.appPort })
    .from(projects)
    .where(and(eq(projects.serverId, localId), isNotNull(projects.appPort)));
  const apps: CaddyApp[] = [];
  for (const r of rows) {
    const addr = localAppAddress(r.subdomain, publicHost, process.env.DEPLYR_APP_DOMAIN || null);
    if (addr && r.appPort) apps.push({ ...addr, port: r.appPort });
  }
  // Custom domains whose DNS has been verified. Caddy gets each one's
  // certificate itself the first time it's asked for the host.
  const custom = await db
    .select({ hostname: domains.hostname, appPort: projects.appPort })
    .from(domains)
    .innerJoin(projects, eq(domains.projectId, projects.id))
    .where(and(eq(projects.serverId, localId), isNotNull(projects.appPort), inArray(domains.status, ["provisioning", "active"])));
  for (const d of custom) if (d.appPort) apps.push({ host: d.hostname, https: true, port: d.appPort });
  return apps;
}

/**
 * The whole Caddy config, derived from state: the dashboard on the bare host
 * (and any custom domain), the API under /api, the API on :4000 for agents
 * and OAuth callbacks, and one site per app deployed on this box.
 *
 * Caddy is the front door on 80/443 for all of it — there is no separate
 * nginx on the local server — so a new app is just a new block here.
 */
export function caddyfileText(publicHost: string, customDomain: string | null, apps: CaddyApp[]): string {
  const dashboard = (rawHost: string) => {
    const host = address(rawHost);
    return (
      `${host} {\n` +
      `\thandle_path /api/* {\n\t\treverse_proxy api:4000\n\t}\n` +
      `\thandle {\n\t\treverse_proxy web:3000\n\t}\n` +
      `}\n\n` +
      `${host}:4000 {\n\treverse_proxy api:4000\n}\n`
    );
  };
  // The local agent (host network) reaches the api through Caddy's published
  // port on the loopback address — no public IP, no firewall involved.
  const localAgent = `http://127.0.0.1 {\n\thandle_path /api/* {\n\t\treverse_proxy api:4000\n\t}\n}\n`;
  const appBlocks = apps
    .map((a) => `${a.https ? a.host : `http://${a.host}`} {\n\treverse_proxy host.docker.internal:${a.port}\n}\n`)
    .join("\n");

  return [
    ADMIN_BLOCK,
    dashboard(publicHost),
    customDomain ? dashboard(customDomain) : "",
    localAgent,
    appBlocks,
  ]
    .filter(Boolean)
    .join("\n");
}

/** `customDomain` overrides what's stored — Settings pushes the new value
 * before it saves it. Omit it to use what's saved. */
export async function buildCaddyfile(opts: { customDomain?: string | null } = {}): Promise<string> {
  const publicHost = process.env.DEPLYR_PUBLIC_HOST;
  if (!publicHost) throw new Error("DEPLYR_PUBLIC_HOST isn't set");
  let customDomain = opts.customDomain;
  if (customDomain === undefined) {
    const [row] = await db.select().from(instanceSettings).where(eq(instanceSettings.id, "default"));
    customDomain = row?.customDomain ?? null;
  }
  return caddyfileText(publicHost, customDomain, await localApps());
}

export function pushCaddyfile(text: string): Promise<Response> {
  return fetch(`${CADDY_ADMIN_URL}/load`, { method: "POST", headers: { "Content-Type": "text/caddyfile" }, body: text });
}

/** Rebuild Caddy's config from the database and apply it. Called whenever
 * what Caddy routes changes (an app deploys or is deleted, the api boots).
 * Throws on failure so a deploy step can report it. */
export async function syncCaddy(): Promise<void> {
  const res = await pushCaddyfile(await buildCaddyfile());
  if (!res.ok) throw new Error(`Caddy rejected its config (${res.status}): ${(await res.text()).slice(0, 300)}`);
}
