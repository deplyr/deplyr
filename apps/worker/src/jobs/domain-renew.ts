import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { db, domains, projects, servers, recordAudit } from "@deplyr/db";
import type { DomainRenewJob } from "@deplyr/queue";
import { runAgentCommand } from "../lib/agent-commands";

const RENEW_TIMEOUT_MS = 3 * 60 * 1000;

interface RenewedCert {
  hostname: string;
  expiresAt: string | null;
  expired: boolean;
}

/**
 * Daily sweep: one `domain.renewAll` call per server that has any domains
 * (certbot itself decides what actually needs renewing — this just asks it
 * to check, then reconciles what it reports back into each domain's row).
 */
export async function processDomainRenew(_job: Job<DomainRenewJob>) {
  const rows = await db
    .select({ domain: domains, project: projects, server: servers })
    .from(domains)
    .innerJoin(projects, eq(domains.projectId, projects.id))
    .innerJoin(servers, eq(projects.serverId, servers.id));

  const byServer = new Map<string, typeof rows>();
  for (const row of rows) {
    if (row.server.status !== "connected") continue; // catches up next sweep
    const list = byServer.get(row.server.id) ?? [];
    list.push(row);
    byServer.set(row.server.id, list);
  }

  for (const [serverId, serverRows] of byServer) {
    let raw: string | undefined;
    try {
      raw = await runAgentCommand({ serverId, name: "domain.renewAll", payload: {}, onLog: () => {}, timeoutMs: RENEW_TIMEOUT_MS });
    } catch (err) {
      console.error(`[worker] domain renewal sweep failed for server ${serverId}`, err);
      continue;
    }

    let renewed: RenewedCert[] = [];
    try {
      renewed = raw ? (JSON.parse(raw) as RenewedCert[]) : [];
    } catch {
      console.error(`[worker] domain renewal sweep for server ${serverId} returned unparseable output`);
      continue;
    }
    const byHostname = new Map(renewed.map((c) => [c.hostname, c]));

    for (const { domain, project } of serverRows) {
      const cert = byHostname.get(domain.hostname);
      if (!cert) continue; // no certificate on file for it — e.g. SSL was never obtained
      if (cert.expired || !cert.expiresAt) {
        await db.update(domains).set({ sslStatus: "error", sslStatusDetail: "Renewal failed — the certificate has expired." }).where(eq(domains.id, domain.id));
        await recordAudit({
          ownerId: project.userId,
          serverId,
          action: "domain.renew",
          status: "failure",
          summary: `Certificate for ${domain.hostname} expired`,
          resourceType: "project",
          resourceId: project.id,
          resourceName: domain.hostname,
        });
        continue;
      }
      const newExpiry = new Date(cert.expiresAt);
      const renewedNow = !domain.certExpiresAt || newExpiry.getTime() !== domain.certExpiresAt.getTime();
      await db
        .update(domains)
        .set({ sslStatus: "active", sslStatusDetail: null, certExpiresAt: newExpiry })
        .where(eq(domains.id, domain.id));
      if (renewedNow) {
        await recordAudit({
          ownerId: project.userId,
          serverId,
          action: "domain.renew",
          status: "success",
          summary: `Renewed the certificate for ${domain.hostname}`,
          resourceType: "project",
          resourceId: project.id,
          resourceName: domain.hostname,
        });
      }
    }
  }
}
