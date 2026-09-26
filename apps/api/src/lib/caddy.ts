import { eq } from "drizzle-orm";
import { db, instanceSettings } from "@deplyr/db";

// Reachable over the internal Docker network only (never published to the
// host — see infra/docker/docker-compose.prod.yml).
export const CADDY_ADMIN_URL = process.env.CADDY_ADMIN_URL ?? "http://caddy:2019";

/** Must match the static Caddyfile's global block: /load replaces the whole
 * config, so without it Caddy falls back to a localhost-only admin API and
 * nothing can reach it again. */
const ADMIN_BLOCK = `{\n\tadmin 0.0.0.0:2019 {\n\t\torigins caddy:2019 localhost:2019 127.0.0.1:2019\n\t}\n}\n`;

/** Same shape as the static infra/docker/Caddyfile — per host: the dashboard
 * (with /api/* going to the API, prefix stripped, so the browser talks to
 * whatever origin it loaded the page from), plus the API on :4000 for agents
 * and OAuth callbacks. Built at request time so a custom domain can sit
 * alongside the bare host instead of replacing it. */
export function caddyfileFor(publicHost: string, customDomain: string | null): string {
  // A bare IP needs an explicit http:// — Caddy otherwise self-signs it and
  // redirects to a port that's usually closed (see infra/docker/Caddyfile).
  const address = (host: string) => (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) ? `http://${host}` : host);
  const blocksFor = (rawHost: string) => {
    const host = address(rawHost);
    return (
      `${host} {\n` +
      `\thandle_path /api/* {\n\t\treverse_proxy api:4000\n\t}\n` +
      `\thandle {\n\t\treverse_proxy web:3000\n\t}\n` +
      `}\n\n` +
      `${host}:4000 {\n\treverse_proxy api:4000\n}\n`
    );
  };
  const sites = customDomain ? `${blocksFor(publicHost)}\n${blocksFor(customDomain)}` : blocksFor(publicHost);
  return `${ADMIN_BLOCK}\n${sites}`;
}

export function pushCaddyfile(text: string): Promise<Response> {
  return fetch(`${CADDY_ADMIN_URL}/load`, { method: "POST", headers: { "Content-Type": "text/caddyfile" }, body: text });
}

/**
 * Caddy runs with --resume, so it comes back with whatever config was last
 * pushed rather than the static Caddyfile — which means a routing change
 * shipped in a new release would never reach an existing install. The api
 * owns the desired config (bare host + any custom domain from the DB), so it
 * re-applies it on every boot. Caddy usually isn't up yet when the api is
 * (it waits on the api's healthcheck), hence the retries.
 */
export async function syncCaddyOnBoot(): Promise<void> {
  const publicHost = process.env.DEPLYR_PUBLIC_HOST;
  if (!publicHost) return; // local dev — no Caddy
  for (let attempt = 1; attempt <= 40; attempt++) {
    try {
      const [row] = await db.select().from(instanceSettings).where(eq(instanceSettings.id, "default"));
      const res = await pushCaddyfile(caddyfileFor(publicHost, row?.customDomain ?? null));
      if (res.ok) {
        console.log("[api] caddy config synced");
        return;
      }
      console.warn(`[api] caddy rejected synced config (${res.status}): ${(await res.text()).slice(0, 200)}`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  console.warn("[api] couldn't reach caddy to sync its config — Settings → Instance address will retry on save");
}
