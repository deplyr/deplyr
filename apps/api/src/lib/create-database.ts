import { db, databases, recordAudit, type servers } from "@deplyr/db";
import { dbProvisionQueue } from "@deplyr/queue";
import type { CreateDatabaseInput } from "@deplyr/shared-types";
import { pickDatabasePort } from "./database-port";

export type CreateDatabaseResult =
  | { ok: true; database: typeof databases.$inferSelect }
  | { ok: false; status: 400 | 409 | 500; error: string };

const isUniqueViolation = (err: unknown): err is { code: string; constraint_name?: string } =>
  typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";

/**
 * The one place a database row gets created and its provisioning queued —
 * shared by the server-level form and the project page's one-click button,
 * so both apply the same port, naming and default rules.
 */
export async function createDatabase(params: {
  server: typeof servers.$inferSelect;
  input: CreateDatabaseInput;
  projectId?: string;
  connectionSecretKey?: string;
}): Promise<CreateDatabaseResult> {
  const { server, input } = params;

  if (server.status !== "connected") {
    return { ok: false, status: 400, error: "This server isn't connected yet." };
  }

  const choice = await pickDatabasePort(server.id, input.type, input.port);
  if ("error" in choice) return { ok: false, status: 409, error: choice.error };

  const config: Record<string, string | number> =
    input.type === "postgres"
      ? { dbName: input.postgres?.dbName ?? "app", username: input.postgres?.username ?? "app" }
      : { policy: input.redis?.policy ?? "allkeys-lru", persistence: input.redis?.persistence ?? "none" };

  try {
    const [database] = await db
      .insert(databases)
      .values({
        serverId: server.id,
        projectId: params.projectId ?? null,
        name: input.name,
        type: input.type,
        version: input.version,
        // Redis is a memory store: an unbounded one can take the whole box
        // down, so it always gets a ceiling unless the caller chose one.
        memoryLimitMb: input.memoryLimitMb ?? (input.type === "redis" ? 256 : null),
        containerName: `deplyr-db-${input.name}`,
        port: choice.port,
        config,
        connectionSecretKey:
          params.connectionSecretKey ?? (input.type === "redis" ? "REDIS_URL" : "DATABASE_URL"),
        status: "provisioning",
      })
      .returning();
    if (!database) return { ok: false, status: 500, error: "Failed to create the database." };

    await dbProvisionQueue().add("provision", { databaseId: database.id });

    await recordAudit({
      ownerId: server.userId,
      serverId: server.id,
      action: "database.create",
      status: "info",
      summary: `Creating ${input.type === "redis" ? "Redis" : "PostgreSQL"} ${input.version} database ${database.name}`,
      detail: `port ${choice.port}${database.memoryLimitMb ? `, ${database.memoryLimitMb} MB limit` : ""}`,
      resourceType: "database",
      resourceId: database.id,
      resourceName: database.name,
    });
    return { ok: true, database };
  } catch (err) {
    if (isUniqueViolation(err)) {
      const byName = err.constraint_name?.includes("name");
      return {
        ok: false,
        status: 409,
        error: byName
          ? `A database named "${input.name}" already exists on this server.`
          : `Port ${choice.port} was just taken — try again.`,
      };
    }
    throw err;
  }
}
