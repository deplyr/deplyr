import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { db, databases, servers, secrets, decryptSecret, recordAudit } from "@deplyr/db";
import { dbOpsQueue } from "@deplyr/queue";
import {
  buildConnectionString,
  createDatabaseInputSchema,
  databaseActionSchema,
  metricsRangeSchema,
  type DatabaseCredentials,
} from "@deplyr/shared-types";
import { requireAuth } from "../lib/require-auth";
import { createDatabase } from "../lib/create-database";
import { resolveConfig, toDatabaseDTO } from "../lib/database-dto";
import { getDatabaseMetricsHistory } from "../lib/database-metrics";
import type { AppEnv } from "../types";

// ---------------------------------------------------------------------------
// /servers/:id/databases — list + create, scoped by the owning server
// ---------------------------------------------------------------------------

export const serverDatabasesRoute = new Hono<AppEnv>();
serverDatabasesRoute.use("*", requireAuth);

async function getOwnedServer(userId: string, serverId: string) {
  const [server] = await db
    .select()
    .from(servers)
    .where(and(eq(servers.id, serverId), eq(servers.userId, userId)));
  return server ?? null;
}

serverDatabasesRoute.get("/:id/databases", async (c) => {
  const server = await getOwnedServer(c.get("userId"), c.req.param("id"));
  if (!server) return c.json({ error: "not found" }, 404);

  const rows = await db
    .select()
    .from(databases)
    .where(eq(databases.serverId, server.id))
    .orderBy(desc(databases.createdAt));
  return c.json(rows.map(toDatabaseDTO));
});

serverDatabasesRoute.post("/:id/databases", async (c) => {
  const server = await getOwnedServer(c.get("userId"), c.req.param("id"));
  if (!server) return c.json({ error: "not found" }, 404);

  const parsed = createDatabaseInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "invalid input", issues: parsed.error.issues }, 400);
  }

  const result = await createDatabase({ server, input: parsed.data });
  if (!result.ok) return c.json({ error: result.error }, result.status);
  return c.json(toDatabaseDTO(result.database), 201);
});

// ---------------------------------------------------------------------------
// /databases/:id — everything that acts on one database
// ---------------------------------------------------------------------------

export const databasesRoute = new Hono<AppEnv>();
databasesRoute.use("*", requireAuth);

async function getOwnedDatabase(userId: string, id: string) {
  const [row] = await db
    .select({ database: databases })
    .from(databases)
    .innerJoin(servers, eq(databases.serverId, servers.id))
    .where(and(eq(databases.id, id), eq(servers.userId, userId)));
  return row?.database ?? null;
}

/** One audit line for something a person asked to do to a database. */
const logRequest = (
  userId: string,
  database: typeof databases.$inferSelect,
  action: string,
  summary: string,
  status: "info" | "success" = "info",
) =>
  recordAudit({
    ownerId: userId,
    serverId: database.serverId,
    action,
    status,
    summary,
    resourceType: "database",
    resourceId: database.id,
    resourceName: database.name,
  });

databasesRoute.get("/:id", async (c) => {
  const database = await getOwnedDatabase(c.get("userId"), c.req.param("id"));
  if (!database) return c.json({ error: "not found" }, 404);
  return c.json(toDatabaseDTO(database));
});

databasesRoute.get("/:id/metrics", async (c) => {
  const database = await getOwnedDatabase(c.get("userId"), c.req.param("id"));
  if (!database) return c.json({ error: "not found" }, 404);

  const range = metricsRangeSchema.safeParse(c.req.query("range") ?? "1h");
  if (!range.success) return c.json({ error: "invalid range" }, 400);

  return c.json(await getDatabaseMetricsHistory(database.id, database.type, range.data));
});

// The only endpoint that returns the password. Same posture as revealing a
// project secret: explicit request, logged, never part of a list response.
databasesRoute.get("/:id/credentials", async (c) => {
  const userId = c.get("userId");
  const database = await getOwnedDatabase(userId, c.req.param("id"));
  if (!database) return c.json({ error: "not found" }, 404);

  let password: string | null = null;
  if (database.passwordEncrypted) {
    password = decryptSecret(database.passwordEncrypted);
  } else if (database.projectId) {
    // Created before passwords were stored on the row: the connection string
    // in the linked project's secrets is the only copy, so read it from there.
    const [secret] = await db
      .select()
      .from(secrets)
      .where(and(eq(secrets.projectId, database.projectId), eq(secrets.key, database.connectionSecretKey)));
    if (secret) {
      try {
        password = decodeURIComponent(new URL(decryptSecret(secret.value)).password);
      } catch {
        password = null;
      }
    }
  }
  if (!password || !database.port) return c.json({ error: "credentials aren't available for this database" }, 404);

  await logRequest(userId, database, "database.credentials.reveal", `Revealed credentials for ${database.name}`, "success");

  const cfg = resolveConfig(database);
  const username = typeof cfg.username === "string" ? cfg.username : null;
  const dbName = typeof cfg.dbName === "string" ? cfg.dbName : null;
  const body: DatabaseCredentials = {
    host: "127.0.0.1",
    port: database.port,
    username,
    dbName,
    password,
    connectionString: buildConnectionString(database.type, { host: "127.0.0.1", port: database.port, username, dbName, password }),
  };
  return c.json(body);
});

databasesRoute.post("/:id/actions", async (c) => {
  const database = await getOwnedDatabase(c.get("userId"), c.req.param("id"));
  if (!database) return c.json({ error: "not found" }, 404);

  const parsed = databaseActionSchema.safeParse((await c.req.json().catch(() => null))?.action);
  if (!parsed.success) return c.json({ error: "invalid action" }, 400);
  const action = parsed.data;

  const allowed: Record<typeof action, readonly string[]> = {
    start: ["stopped", "error"],
    stop: ["running"],
    restart: ["running", "error"],
  };
  if (!allowed[action].includes(database.status)) {
    return c.json({ error: `can't ${action} a database that is ${database.status}` }, 409);
  }

  // "provisioning" doubles as "an operation is in flight" so the UI's
  // existing poll picks up the result; statusDetail says which one.
  await db
    .update(databases)
    .set({
      status: "provisioning",
      statusDetail: { start: "Starting…", stop: "Stopping…", restart: "Restarting…" }[action],
    })
    .where(eq(databases.id, database.id));
  await dbOpsQueue().add(action, { databaseId: database.id, action });
  await logRequest(
    c.get("userId"),
    database,
    `database.${action}`,
    `${{ start: "Starting", stop: "Stopping", restart: "Restarting" }[action]} database ${database.name}`,
  );

  return c.json({ ok: true }, 202);
});

databasesRoute.delete("/:id", async (c) => {
  const database = await getOwnedDatabase(c.get("userId"), c.req.param("id"));
  if (!database) return c.json({ error: "not found" }, 404);

  // A database stuck in "error" on a server that's gone can never be removed
  // by the agent; ?force=1 drops only the record and leaves the box alone.
  if (c.req.query("force") === "1") {
    await db.delete(databases).where(eq(databases.id, database.id));
    await logRequest(
      c.get("userId"),
      database,
      "database.delete",
      `Removed the record of database ${database.name} (the server was not touched)`,
      "success",
    );
    return c.json({ ok: true, forced: true });
  }

  await db
    .update(databases)
    .set({ status: "removing", statusDetail: "Removing…" })
    .where(eq(databases.id, database.id));
  await dbOpsQueue().add("remove", { databaseId: database.id, action: "remove" });
  await logRequest(c.get("userId"), database, "database.delete", `Deleting database ${database.name}`);
  return c.json({ ok: true }, 202);
});
