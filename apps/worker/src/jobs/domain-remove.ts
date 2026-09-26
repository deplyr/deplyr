import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { db, domains, projects, servers, recordAudit, syncCaddy } from "@deplyr/db";
import type { DomainRemoveJob } from "@deplyr/queue";
import { runAgentCommand } from "../lib/agent-commands";

/** Removes a domain's nginx config and certificate from its server, then the
 * row itself. If the server can't be reached, the row is deleted anyway —
 * matching database removal's posture: the user asked this domain to stop
 * existing in Deplyr, and an unreachable box shouldn't be able to block that
 * (the leftover nginx config there, if any, is harmless: nothing DNS-wise
 * points at Deplyr for it once this returns). */
export async function processDomainRemove(job: Job<DomainRemoveJob>) {
  const { domainId } = job.data;
  const [domain] = await db.select().from(domains).where(eq(domains.id, domainId));
  if (!domain) return; // already gone

  const [project] = await db.select().from(projects).where(eq(projects.id, domain.projectId));
  const [server] = project ? await db.select().from(servers).where(eq(servers.id, project.serverId)) : [];

  const isLocal = !!server && server.id === process.env.DEPLYR_LOCAL_SERVER_ID;
  if (server?.status === "connected" && !isLocal) {
    try {
      await runAgentCommand({
        serverId: server.id,
        name: "domain.remove",
        payload: { hostname: domain.hostname },
        onLog: () => {},
        timeoutMs: 60_000,
      });
    } catch (err) {
      console.error(`[worker] domain.remove failed for ${domain.hostname}, deleting the record anyway`, err);
    }
  }

  await db.delete(domains).where(eq(domains.id, domainId));
  if (isLocal) await syncCaddy().catch((err) => console.error("[worker] caddy sync after domain removal failed", err));

  if (project) {
    await recordAudit({
      ownerId: project.userId,
      serverId: project.serverId,
      action: "domain.remove",
      status: "success",
      summary: `Removed domain ${domain.hostname}`,
      resourceType: "project",
      resourceId: project.id,
      resourceName: domain.hostname,
    });
  }
}
