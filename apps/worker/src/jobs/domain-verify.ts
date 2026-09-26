import { resolve4, resolveCname } from "node:dns/promises";
import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { connect } from "node:tls";
import { db, domains, projects, servers, recordAudit, syncCaddy } from "@deplyr/db";
import { domainVerifyQueue, DOMAIN_VERIFY_RETRY_MS, type DomainVerifyJob } from "@deplyr/queue";
import { dnsInstructionFor } from "@deplyr/shared-types";
import { runAgentCommand } from "../lib/agent-commands";

const PROVISION_TIMEOUT_MS = 2 * 60 * 1000;

// Cloudflare's proxy ranges (the orange cloud). A domain resolving to these is
// hidden behind Cloudflare, so its real target can't be checked — and the
// certificate challenge can't reach the server.
const CLOUDFLARE_PREFIXES = [
  ["103.21.244.0", 22], ["103.22.200.0", 22], ["103.31.4.0", 22], ["104.16.0.0", 13], ["108.162.192.0", 18],
  ["131.0.72.0", 22], ["141.101.64.0", 18], ["162.158.0.0", 15], ["172.64.0.0", 13], ["173.245.48.0", 20],
  ["188.114.96.0", 20], ["190.93.240.0", 20], ["197.234.240.0", 22], ["198.41.128.0", 17],
] as const;
const ipToInt = (ip: string) => ip.split(".").reduce((n, o) => n * 256 + Number(o), 0);
const isCloudflareIp = (ip: string) =>
  CLOUDFLARE_PREFIXES.some(([base, bits]) => {
    const size = 2 ** (32 - bits);
    return Math.floor(ipToInt(ip) / size) === Math.floor(ipToInt(base) / size);
  });

/** Waits for Caddy to serve a valid certificate for `hostname`; resolves the
 * expiry, or null if it isn't there after ~90s. */
async function waitForCaddyCert(hostname: string): Promise<Date | null> {
  const probe = () =>
    new Promise<Date | null>((resolve) => {
      const socket = connect({ host: "caddy", port: 443, servername: hostname, rejectUnauthorized: true, timeout: 5000 }, () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        resolve(cert?.valid_to ? new Date(cert.valid_to) : null);
      });
      socket.on("error", () => resolve(null));
      socket.on("timeout", () => {
        socket.destroy();
        resolve(null);
      });
    });
  for (let i = 0; i < 18; i++) {
    const expires = await probe();
    if (expires) return expires;
    await new Promise((r) => setTimeout(r, 5000));
  }
  return null;
}

/**
 * Checks whether a domain's DNS points where we told the user to point it,
 * and — once it does — configures nginx and requests a certificate for it.
 * Both stages live in one job (not split across queues) because they're
 * inherently sequential, the same shape as the deploy pipeline's steps.
 *
 * DNS mismatches and an unready project (no deploy yet) re-check themselves
 * on a timer with no user action needed. Provisioning failures (nginx,
 * certbot) do NOT self-retry — Let's Encrypt rate-limits repeated failures
 * per hostname, so a wedged domain must be retried explicitly from the UI
 * rather than hammered automatically.
 */
export async function processDomainVerify(job: Job<DomainVerifyJob>) {
  const { domainId } = job.data;
  const [domain] = await db.select().from(domains).where(eq(domains.id, domainId));
  if (!domain || domain.status === "removing") return; // deleted, or being deleted, while queued

  const [project] = await db.select().from(projects).where(eq(projects.id, domain.projectId));
  if (!project) return; // project deleted out from under it — nothing to verify against

  // Unset on self-host until an operator configures one — dnsInstructionFor
  // falls back to a plain A record at the server's IP when this is null.
  const appDomain = process.env.DEPLYR_APP_DOMAIN || null;
  const [server] = await db.select().from(servers).where(eq(servers.id, project.serverId));

  const retry = async (detail: string) => {
    await db.update(domains).set({ status: "pending_dns", statusDetail: detail, lastCheckedAt: new Date() }).where(eq(domains.id, domainId));
    await domainVerifyQueue().add("check", { domainId }, { delay: DOMAIN_VERIFY_RETRY_MS });
  };

  if (!server || server.status !== "connected") {
    await retry("The project's server isn't connected right now — this will keep checking automatically.");
    return;
  }

  const instruction = dnsInstructionFor(domain.hostname, appDomain, server.ipAddress);
  let matched = false;
  let seen = "no record found";
  try {
    if (instruction.type === "A") {
      const addrs = await resolve4(domain.hostname);
      matched = addrs.includes(instruction.value);
      seen = addrs.join(", ");
    } else {
      // Some registrars flatten a subdomain's ALIAS/ANAME to an A record
      // instead of a real CNAME — accept either, since both work.
      try {
        const names = await resolveCname(domain.hostname);
        matched = names.some((n) => n.replace(/\.$/, "") === instruction.value.replace(/\.$/, ""));
        seen = names.join(", ");
      } catch {
        const addrs = await resolve4(domain.hostname);
        matched = addrs.includes(server.ipAddress);
        seen = addrs.join(", ");
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await retry(`Couldn't resolve ${domain.hostname} yet (${message}). DNS changes can take a while to propagate.`);
    return;
  }

  if (!matched) {
    const proxied = seen.split(", ").some(isCloudflareIp);
    if (proxied) {
      await retry(
        `${domain.hostname} is behind Cloudflare's proxy (orange cloud), so it can't be pointed at your server or get a certificate. In Cloudflare DNS, set this record to "DNS only" (grey cloud) with the A record ${instruction.value}, then check again.`,
      );
      return;
    }
    await retry(
      `${domain.hostname} ${instruction.type === "A" ? "points to" : "resolves to"} "${seen}", not the ${instruction.type} record we're expecting (${instruction.value}). Add the DNS record shown below, then wait for it to propagate.`,
    );
    return;
  }

  if (!project.appPort) {
    await retry("DNS looks right. Waiting for this project's first deploy before the domain can go live.");
    return;
  }

  await db.update(domains).set({ status: "provisioning", statusDetail: "DNS looks right — setting up HTTPS…", lastCheckedAt: new Date() }).where(eq(domains.id, domainId));

  // The box Deplyr runs on is fronted by Caddy, not nginx: the domain just
  // becomes a site in Caddy's config and Caddy gets the certificate itself.
  if (server.id === process.env.DEPLYR_LOCAL_SERVER_ID) {
    try {
      await syncCaddy();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db.update(domains).set({ status: "error", statusDetail: message }).where(eq(domains.id, domainId));
      return;
    }
    await db
      .update(domains)
      .set({ status: "active", statusDetail: null, sslStatus: "provisioning", sslStatusDetail: "Requesting a certificate…" })
      .where(eq(domains.id, domainId));
    const expires = await waitForCaddyCert(domain.hostname);
    if (!expires) {
      await db
        .update(domains)
        .set({ sslStatus: "error", sslStatusDetail: "Caddy couldn't get a certificate yet. Make sure ports 80 and 443 are open and DNS isn't proxied, then retry." })
        .where(eq(domains.id, domainId));
      return;
    }
    await db.update(domains).set({ sslStatus: "active", sslStatusDetail: null, certExpiresAt: expires }).where(eq(domains.id, domainId));
    await recordAudit({
      ownerId: project.userId,
      serverId: server.id,
      action: "domain.active",
      status: "success",
      summary: `${domain.hostname} is live`,
      detail: "HTTPS is on",
      resourceType: "project",
      resourceId: project.id,
      resourceName: domain.hostname,
    });
    return;
  }

  try {
    await runAgentCommand({
      serverId: server.id,
      name: "domain.configureHttp",
      payload: { hostname: domain.hostname, port: project.appPort },
      onLog: () => {},
      timeoutMs: PROVISION_TIMEOUT_MS,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.update(domains).set({ status: "error", statusDetail: message }).where(eq(domains.id, domainId));
    await recordAudit({
      ownerId: project.userId,
      serverId: server.id,
      action: "domain.provision",
      status: "failure",
      summary: `Couldn't set up ${domain.hostname}`,
      detail: message,
      resourceType: "project",
      resourceId: project.id,
      resourceName: domain.hostname,
    });
    return;
  }

  // The domain works over plain HTTP from here regardless of what happens
  // next, so it's "active" even if the certificate step below fails.
  await db
    .update(domains)
    .set({ status: "active", statusDetail: null, sslStatus: "provisioning", sslStatusDetail: "Requesting a certificate…" })
    .where(eq(domains.id, domainId));

  let expiresAt: string | undefined;
  try {
    expiresAt = await runAgentCommand({
      serverId: server.id,
      name: "domain.issueCert",
      payload: { hostname: domain.hostname, port: project.appPort },
      onLog: () => {},
      timeoutMs: PROVISION_TIMEOUT_MS,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.update(domains).set({ sslStatus: "error", sslStatusDetail: message }).where(eq(domains.id, domainId));
    await recordAudit({
      ownerId: project.userId,
      serverId: server.id,
      action: "domain.ssl",
      status: "failure",
      summary: `Couldn't get a certificate for ${domain.hostname}`,
      detail: message,
      resourceType: "project",
      resourceId: project.id,
      resourceName: domain.hostname,
    });
    return;
  }

  if (!expiresAt) {
    // The agent already logged certbot's own reason; nothing more specific
    // reaches us than "it failed" — the domain stays reachable over HTTP.
    await db
      .update(domains)
      .set({ sslStatus: "error", sslStatusDetail: "Couldn't obtain a certificate. The domain is reachable over HTTP — check the activity log for why, then retry." })
      .where(eq(domains.id, domainId));
    await recordAudit({
      ownerId: project.userId,
      serverId: server.id,
      action: "domain.ssl",
      status: "failure",
      summary: `Couldn't get a certificate for ${domain.hostname}`,
      resourceType: "project",
      resourceId: project.id,
      resourceName: domain.hostname,
    });
    return;
  }

  await db
    .update(domains)
    .set({ sslStatus: "active", sslStatusDetail: null, certExpiresAt: new Date(expiresAt) })
    .where(eq(domains.id, domainId));
  await recordAudit({
    ownerId: project.userId,
    serverId: server.id,
    action: "domain.active",
    status: "success",
    summary: `${domain.hostname} is live`,
    detail: "HTTPS is on",
    resourceType: "project",
    resourceId: project.id,
    resourceName: domain.hostname,
  });
}
