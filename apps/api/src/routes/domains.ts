import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db, domains, projects, servers, recordAudit } from "@deplyr/db";
import { domainRemoveQueue, domainVerifyQueue } from "@deplyr/queue";
import { checkHostnameFormat, createDomainInputSchema, dnsInstructionFor, type DefaultDomainDTO, type DomainDTO } from "@deplyr/shared-types";
import { requireAuth } from "../lib/require-auth";
import type { AppEnv } from "../types";

export const domainsRoute = new Hono<AppEnv>();
domainsRoute.use("*", requireAuth);

const appDomain = () => process.env.DEPLYR_APP_DOMAIN ?? "deplyr.app";

async function getOwnedProjectWithServer(userId: string, projectId: string) {
  const [row] = await db
    .select({ project: projects, server: servers })
    .from(projects)
    .innerJoin(servers, eq(projects.serverId, servers.id))
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
  return row ?? null;
}

function toDomainDTO(row: typeof domains.$inferSelect, serverIp: string): DomainDTO {
  return {
    id: row.id,
    projectId: row.projectId,
    hostname: row.hostname,
    status: row.status,
    statusDetail: row.statusDetail,
    sslStatus: row.sslStatus,
    sslStatusDetail: row.sslStatusDetail,
    certExpiresAt: row.certExpiresAt ? row.certExpiresAt.toISOString() : null,
    lastCheckedAt: row.lastCheckedAt ? row.lastCheckedAt.toISOString() : null,
    dns: dnsInstructionFor(row.hostname, appDomain(), serverIp),
    createdAt: row.createdAt.toISOString(),
  };
}

domainsRoute.get("/:id/domains", async (c) => {
  const found = await getOwnedProjectWithServer(c.get("userId"), c.req.param("id"));
  if (!found) return c.json({ error: "not found" }, 404);
  const { project, server } = found;

  const rows = await db.select().from(domains).where(eq(domains.projectId, project.id)).orderBy(domains.createdAt);

  const defaultDomain: DefaultDomainDTO = {
    hostname: `${project.subdomain}.${appDomain()}`,
    https: project.defaultDomainHttps,
    checkedAt: project.defaultDomainCheckedAt ? project.defaultDomainCheckedAt.toISOString() : null,
  };

  return c.json({ default: defaultDomain, domains: rows.map((r) => toDomainDTO(r, server.ipAddress)) });
});

domainsRoute.post("/:id/domains", async (c) => {
  const userId = c.get("userId");
  const found = await getOwnedProjectWithServer(userId, c.req.param("id"));
  if (!found) return c.json({ error: "not found" }, 404);
  const { project, server } = found;

  const parsed = createDomainInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid input" }, 400);

  const check = checkHostnameFormat(parsed.data.hostname, appDomain());
  if (!check.ok || !check.normalized) return c.json({ error: check.error }, 400);
  const hostname = check.normalized;

  const [existing] = await db.select({ id: domains.id }).from(domains).where(eq(domains.hostname, hostname));
  if (existing) return c.json({ error: "This domain is already connected to a project." }, 409);

  const [domain] = await db.insert(domains).values({ projectId: project.id, hostname }).returning();
  if (!domain) return c.json({ error: "failed to add domain" }, 500);

  await domainVerifyQueue().add("check", { domainId: domain.id });
  await recordAudit({
    ownerId: userId,
    serverId: project.serverId,
    action: "domain.create",
    status: "info",
    summary: `Added domain ${hostname} to ${project.name}`,
    resourceType: "project",
    resourceId: project.id,
    resourceName: hostname,
  });

  return c.json(toDomainDTO(domain, server.ipAddress), 201);
});

domainsRoute.post("/:id/domains/:domainId/verify", async (c) => {
  const found = await getOwnedProjectWithServer(c.get("userId"), c.req.param("id"));
  if (!found) return c.json({ error: "not found" }, 404);

  const [domain] = await db.select().from(domains).where(and(eq(domains.id, c.req.param("domainId")), eq(domains.projectId, found.project.id)));
  if (!domain) return c.json({ error: "not found" }, 404);
  if (domain.status === "removing") return c.json({ error: "this domain is being removed" }, 409);

  // A previously auto-scheduled retry (if any) is still out there too — with
  // no fixed jobId that's harmless: worst case DNS gets checked twice.
  await db.update(domains).set({ statusDetail: "Checking…" }).where(eq(domains.id, domain.id));
  await domainVerifyQueue().add("check", { domainId: domain.id });

  return c.json({ ok: true }, 202);
});

domainsRoute.delete("/:id/domains/:domainId", async (c) => {
  const userId = c.get("userId");
  const found = await getOwnedProjectWithServer(userId, c.req.param("id"));
  if (!found) return c.json({ error: "not found" }, 404);

  const [domain] = await db.select().from(domains).where(and(eq(domains.id, c.req.param("domainId")), eq(domains.projectId, found.project.id)));
  if (!domain) return c.json({ error: "not found" }, 404);

  await db.update(domains).set({ status: "removing", statusDetail: "Removing…" }).where(eq(domains.id, domain.id));
  await domainRemoveQueue().add("remove", { domainId: domain.id });
  await recordAudit({
    ownerId: userId,
    serverId: found.project.serverId,
    action: "domain.delete",
    status: "info",
    summary: `Removing domain ${domain.hostname} from ${found.project.name}`,
    resourceType: "project",
    resourceId: found.project.id,
    resourceName: domain.hostname,
  });

  return c.json({ ok: true }, 202);
});
