import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db, instanceSettings, recordAudit } from "@deplyr/db";
import { checkHostnameFormat, updateInstanceDomainSchema, type InstanceSettingsDTO } from "@deplyr/shared-types";
import { requireAuth } from "../lib/require-auth";
import type { AppEnv } from "../types";

export const instanceRoute = new Hono<AppEnv>();
instanceRoute.use("*", requireAuth);

// Reachable over the internal Docker network only (never published to the
// host — see infra/docker/docker-compose.prod.yml) — this is what makes
// pushing a new domain from the dashboard possible without SSH or a
// container rebuild: Caddy takes a full Caddyfile and reconfigures itself
// live, no restart.
const CADDY_ADMIN_URL = process.env.CADDY_ADMIN_URL ?? "http://caddy:2019";
const ROW_ID = "default";

async function getRow() {
  const [row] = await db.select().from(instanceSettings).where(eq(instanceSettings.id, ROW_ID));
  return row ?? null;
}

/** Same shape as the static infra/docker/Caddyfile — two site blocks per
 * host (dashboard, then the API on :4000) — just built at request time so a
 * custom domain can sit alongside the bare host instead of replacing it. */
function caddyfileFor(publicHost: string, customDomain: string | null): string {
  const blocksFor = (host: string) => `${host} {\n\treverse_proxy web:3000\n}\n\n${host}:4000 {\n\treverse_proxy api:4000\n}\n`;
  return customDomain ? `${blocksFor(publicHost)}\n${blocksFor(customDomain)}` : blocksFor(publicHost);
}

instanceRoute.get("/", async (c) => {
  const row = await getRow();
  const body: InstanceSettingsDTO = {
    publicHost: process.env.DEPLYR_PUBLIC_HOST ?? "",
    customDomain: row?.customDomain ?? null,
    domainStatus: row?.domainStatus ?? "none",
    domainStatusDetail: row?.domainStatusDetail ?? null,
  };
  return c.json(body);
});

instanceRoute.put("/domain", async (c) => {
  const userId = c.get("userId") as string;
  const parsed = updateInstanceDomainSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "invalid input" }, 400);

  const publicHost = process.env.DEPLYR_PUBLIC_HOST;
  if (!publicHost) return c.json({ error: "DEPLYR_PUBLIC_HOST isn't set on this instance" }, 500);

  const raw = parsed.data.hostname?.trim();
  let customDomain: string | null = null;
  if (raw) {
    // Same collision rule as a project's custom domain: this instance
    // shouldn't sit on the exact wildcard base every project's free address
    // already uses.
    const check = checkHostnameFormat(raw, process.env.DEPLYR_APP_DOMAIN ?? "");
    if (!check.ok) return c.json({ error: check.error }, 400);
    customDomain = check.normalized!;
  }

  let caddyRes: Response;
  try {
    caddyRes = await fetch(`${CADDY_ADMIN_URL}/load`, {
      method: "POST",
      headers: { "Content-Type": "text/caddyfile" },
      body: caddyfileFor(publicHost, customDomain),
    });
  } catch {
    return c.json({ error: "Couldn't reach Caddy to apply this — is the caddy container running?" }, 502);
  }

  if (!caddyRes.ok) {
    const detail = (await caddyRes.text().catch(() => "")).trim().slice(0, 500) || "Caddy rejected this configuration.";
    await db
      .insert(instanceSettings)
      .values({ id: ROW_ID, customDomain, domainStatus: "error", domainStatusDetail: detail })
      .onConflictDoUpdate({ target: instanceSettings.id, set: { customDomain, domainStatus: "error", domainStatusDetail: detail, updatedAt: new Date() } });
    return c.json({ error: detail }, 400);
  }

  // Caddy accepting the config is the only signal available synchronously —
  // certificate issuance itself happens in the background afterward. Good
  // enough for this: the dashboard's copy says HTTPS can take a minute.
  const [row] = await db
    .insert(instanceSettings)
    .values({ id: ROW_ID, customDomain, domainStatus: customDomain ? "active" : "none", domainStatusDetail: null })
    .onConflictDoUpdate({
      target: instanceSettings.id,
      set: { customDomain, domainStatus: customDomain ? "active" : "none", domainStatusDetail: null, updatedAt: new Date() },
    })
    .returning();
  if (!row) return c.json({ error: "failed to save" }, 500);

  await recordAudit({
    ownerId: userId,
    action: "instance.domain.update",
    status: "success",
    summary: customDomain ? `Pointed this instance at ${customDomain}` : "Removed this instance's custom domain",
    resourceName: customDomain ?? publicHost,
  });

  const body: InstanceSettingsDTO = {
    publicHost,
    customDomain: row.customDomain,
    domainStatus: row.domainStatus,
    domainStatusDetail: row.domainStatusDetail,
  };
  return c.json(body);
});
