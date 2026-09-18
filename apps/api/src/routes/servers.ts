import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { db, servers, encryptSecret } from "@argo/db";
import { registerServerInputSchema } from "@argo/shared-types";
import { serverInstallQueue } from "@argo/queue";
import { requireAuth } from "../lib/require-auth";
import type { AppEnv } from "../types";

export const serversRoute = new Hono<AppEnv>();
serversRoute.use("*", requireAuth);

// Never send the encrypted SSH credential or the token hash back to the
// browser — this is the only shape a server row should leave the API in.
function toServerDTO(server: typeof servers.$inferSelect) {
  return {
    id: server.id,
    name: server.name,
    ipAddress: server.ipAddress,
    status: server.status,
    statusDetail: server.statusDetail,
    dockerInstalled: server.dockerInstalled,
    agentConnectedAt: server.agentConnectedAt,
    createdAt: server.createdAt,
  };
}

serversRoute.get("/", async (c) => {
  const userId = c.get("userId");
  const rows = await db
    .select()
    .from(servers)
    .where(eq(servers.userId, userId))
    .orderBy(desc(servers.createdAt));
  return c.json(rows.map(toServerDTO));
});

serversRoute.get("/:id", async (c) => {
  const userId = c.get("userId");
  const [server] = await db
    .select()
    .from(servers)
    .where(and(eq(servers.id, c.req.param("id")), eq(servers.userId, userId)));
  if (!server) return c.json({ error: "not found" }, 404);
  return c.json(toServerDTO(server));
});

serversRoute.post("/", async (c) => {
  const userId = c.get("userId");
  const parsed = registerServerInputSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: "invalid input", issues: parsed.error.issues }, 400);
  }
  const input = parsed.data;

  const [server] = await db
    .insert(servers)
    .values({
      userId,
      name: input.name,
      ipAddress: input.ipAddress,
      sshCredential: encryptSecret(input.credential),
      sshCredentialType: input.credentialType,
      status: "pending",
    })
    .returning();

  if (!server) return c.json({ error: "failed to create server" }, 500);

  await serverInstallQueue().add("install", { serverId: server.id });

  return c.json(toServerDTO(server), 201);
});
