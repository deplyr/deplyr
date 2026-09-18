import type { Job } from "bullmq";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, databases, projects, servers, secrets, encryptSecret } from "@argo/db";
import type { DbProvisionJob } from "@argo/queue";
import type { DbProvisionCommandPayload } from "@argo/shared-types";
import { runAgentCommand } from "../lib/agent-commands";
import { allocateDbPort } from "../lib/allocate-port";

const DB_USERNAME = "app";
const DB_NAME = "app";

/** Provisions the (at most one, Phase 1) Postgres database for a project.
 * The `databases` row already exists by the time this runs — the API
 * route creates it (with its allocated port) before enqueueing this job,
 * same pattern as deploy-run. */
export async function processDbProvision(job: Job<DbProvisionJob>) {
  const { projectId } = job.data;

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) {
    console.error(`[worker] db:provision — project ${projectId} not found`);
    return;
  }

  const [database] = await db.select().from(databases).where(eq(databases.projectId, projectId));
  if (!database) {
    console.error(`[worker] db:provision — no database row for project ${projectId}`);
    return;
  }

  const [server] = await db.select().from(servers).where(eq(servers.id, project.serverId));
  if (!server || server.status !== "connected") {
    await db.update(databases).set({ status: "error" }).where(eq(databases.id, database.id));
    console.error(`[worker] db:provision — server not connected for project ${projectId}`);
    return;
  }

  let port = database.port;
  if (!port) {
    port = await allocateDbPort();
    await db.update(databases).set({ port }).where(eq(databases.id, database.id));
  }

  const password = randomBytes(24).toString("base64url");
  const payload: DbProvisionCommandPayload = {
    containerName: database.containerName,
    port,
    dbName: DB_NAME,
    username: DB_USERNAME,
    password,
  };

  try {
    await runAgentCommand({
      serverId: server.id,
      name: "db.provisionPostgres",
      payload: payload as unknown as Record<string, unknown>,
      // No deploy_steps-style log surface for this in Phase 1 — the
      // provisioning/running/error status is enough for the UI.
      onLog: () => {},
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.update(databases).set({ status: "error" }).where(eq(databases.id, database.id));
    console.error(`[worker] db:provision failed for project ${projectId}: ${message}`);
    return;
  }

  const connectionString = `postgres://${DB_USERNAME}:${password}@127.0.0.1:${port}/${DB_NAME}`;

  await db
    .insert(secrets)
    .values({
      projectId,
      key: database.connectionSecretKey,
      value: encryptSecret(connectionString),
      source: "system",
    })
    .onConflictDoUpdate({
      target: [secrets.projectId, secrets.key],
      set: { value: encryptSecret(connectionString), source: "system", updatedAt: new Date() },
    });

  await db.update(databases).set({ status: "running" }).where(eq(databases.id, database.id));
}
