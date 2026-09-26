import { buildCaddyfile, pushCaddyfile } from "@deplyr/db";

/**
 * Caddy runs with --resume, so it comes back with whatever config was last
 * pushed rather than the static Caddyfile — which means a routing change
 * shipped in a new release would never reach an existing install. The config
 * is derived from the database (bare host, any custom domain, every app on
 * this box — see packages/db/src/caddy.ts), so the api re-applies it on every
 * boot. Caddy usually isn't up yet when the api is (it waits on the api's
 * healthcheck), hence the retries.
 */
export async function syncCaddyOnBoot(): Promise<void> {
  if (!process.env.DEPLYR_PUBLIC_HOST) return; // local dev — no Caddy
  for (let attempt = 1; attempt <= 40; attempt++) {
    try {
      const res = await pushCaddyfile(await buildCaddyfile());
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
