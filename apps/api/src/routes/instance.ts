import { resolve4 } from "node:dns/promises";
import tls from "node:tls";
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { buildCaddyfile, db, instanceSettings, pushCaddyfile, recordAudit } from "@deplyr/db";
import {
  checkHostnameFormat,
  updateInstanceDomainSchema,
  type InstanceDomainCheck,
  type InstanceSettingsDTO,
} from "@deplyr/shared-types";
import { requireAuth } from "../lib/require-auth";
import type { AppEnv } from "../types";

export const instanceRoute = new Hono<AppEnv>();
instanceRoute.use("*", requireAuth);

const ROW_ID = "default";

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

async function lookupIps(host: string): Promise<string[]> {
  try {
    return await resolve4(host);
  } catch {
    return [];
  }
}

/** Has Caddy got a trusted certificate for this hostname yet? Asks Caddy
 * directly over the Docker network with the domain as SNI, so it works no
 * matter what the public DNS or the firewall does — and a trusted, matching
 * certificate is only ever there once Let's Encrypt has actually issued it. */
function certificateServed(domain: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = tls.connect(
      { host: process.env.CADDY_TLS_HOST ?? "caddy", port: 443, servername: domain, rejectUnauthorized: false, timeout: 3000 },
      () => {
        const san = socket.getPeerCertificate()?.subjectaltname ?? "";
        const ok = socket.authorized && san.split(",").some((e: string) => e.trim() === `DNS:${domain}`);
        socket.end();
        resolve(ok);
      },
    );
    socket.on("error", () => resolve(false));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function checkDomain(domain: string, publicHost: string): Promise<InstanceDomainCheck> {
  const [resolvedIps, expectedIps] = await Promise.all([
    lookupIps(domain),
    IPV4.test(publicHost) ? Promise.resolve([publicHost]) : lookupIps(publicHost),
  ]);
  if (resolvedIps.length === 0) return { state: "waiting_dns", resolvedIps, expectedIps };
  if (expectedIps.length > 0 && !resolvedIps.some((ip) => expectedIps.includes(ip))) {
    return { state: "wrong_dns", resolvedIps, expectedIps };
  }
  return { state: (await certificateServed(domain)) ? "active" : "issuing_cert", resolvedIps, expectedIps };
}

async function getRow() {
  const [row] = await db.select().from(instanceSettings).where(eq(instanceSettings.id, ROW_ID));
  return row ?? null;
}

instanceRoute.get("/", async (c) => {
  const row = await getRow();
  const publicHost = process.env.DEPLYR_PUBLIC_HOST ?? "";
  const body: InstanceSettingsDTO = {
    publicHost,
    customDomain: row?.customDomain ?? null,
    domainStatus: row?.domainStatus ?? "none",
    domainStatusDetail: row?.domainStatusDetail ?? null,
    check: row?.customDomain && row.domainStatus !== "error" ? await checkDomain(row.customDomain, publicHost) : null,
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
    caddyRes = await pushCaddyfile(await buildCaddyfile({ customDomain }));
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
    check: row.customDomain ? await checkDomain(row.customDomain, publicHost) : null,
  };
  return c.json(body);
});
