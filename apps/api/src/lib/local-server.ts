import { asc, eq } from "drizzle-orm";
import { db, encryptSecret, recordAudit, servers, users } from "@deplyr/db";

/**
 * The box Deplyr itself runs on is registered as a managed server
 * automatically, so a fresh install can deploy straight away instead of
 * asking you to "connect" the machine you're already on.
 *
 * There's no SSH involved: infra/install.sh starts the agent on the host
 * with a token it generated (DEPLYR_LOCAL_AGENT_TOKEN) and a server id
 * (DEPLYR_LOCAL_SERVER_ID), both also handed to this process. All that's
 * missing then is the row those two refer to — which needs an owner, so it
 * can only be created once the first account exists. This is that row. The
 * agent retries with backoff until it does, then authenticates against the
 * token hash stored here.
 *
 * Idempotent, and self-healing: deleting the server from the UI just gets
 * it re-created on the next boot.
 */
export async function ensureLocalServer(): Promise<void> {
  const id = process.env.DEPLYR_LOCAL_SERVER_ID;
  const token = process.env.DEPLYR_LOCAL_AGENT_TOKEN;
  const host = process.env.DEPLYR_PUBLIC_HOST;
  if (!id || !token || !host) return; // not an installer-managed instance (e.g. local dev)

  const [existing] = await db.select({ id: servers.id }).from(servers).where(eq(servers.id, id));
  if (existing) return;

  const [owner] = await db.select({ id: users.id }).from(users).orderBy(asc(users.createdAt)).limit(1);
  if (!owner) return; // first account not created yet — signup calls this again

  const [server] = await db
    .insert(servers)
    .values({
      id,
      userId: owner.id,
      name: "This server",
      ipAddress: host,
      // Never used: nothing SSHes into the local server. The column is
      // required, so it holds an obvious placeholder.
      sshCredential: encryptSecret("local"),
      sshCredentialType: "password",
      agentTokenHash: await Bun.password.hash(token, { algorithm: "argon2id" }),
      status: "installing",
      statusDetail: "Waiting for this server's agent to connect…",
      dockerInstalled: true,
    })
    .onConflictDoNothing()
    .returning();

  if (!server) return;
  await recordAudit({
    ownerId: owner.id,
    serverId: server.id,
    actor: "system",
    action: "server.register",
    status: "success",
    summary: "Registered this server automatically",
    detail: host,
    resourceType: "server",
    resourceId: server.id,
    resourceName: server.name,
  });
}

/** Fire-and-forget wrapper for call sites (signup, boot) that must never
 * fail because of this. */
export function ensureLocalServerSafely(): void {
  ensureLocalServer().catch((err) => console.warn("[api] couldn't register the local server:", err));
}
