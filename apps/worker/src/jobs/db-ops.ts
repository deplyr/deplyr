import type { Job } from "bullmq";
import { and, eq } from "drizzle-orm";
import { db, databases, servers, secrets, recordAudit } from "@deplyr/db";
import type { DbOpsJob } from "@deplyr/queue";
import { runAgentCommand } from "../lib/agent-commands";

const OPS_TIMEOUT_MS = 2 * 60 * 1000;

/** start / stop / restart / remove for an existing database container. */
export async function processDbOps(job: Job<DbOpsJob>) {
  const { databaseId, action } = job.data;

  const [database] = await db.select().from(databases).where(eq(databases.id, databaseId));
  if (!database) return; // deleted while queued

  const [server] = await db.select().from(servers).where(eq(servers.id, database.serverId));

  const past = { start: "Started", stop: "Stopped", restart: "Restarted", remove: "Deleted" }[action];
  const verb = { start: "start", stop: "stop", restart: "restart", remove: "delete" }[action];
  const audit = (status: "success" | "failure", summary: string, detail?: string) =>
    server
      ? recordAudit({
          ownerId: server.userId,
          serverId: server.id,
          actor: "system",
          // "remove" is the job's name; the log calls it what the user did.
          action: action === "remove" ? "database.delete" : `database.${action}`,
          status,
          summary,
          detail,
          resourceType: "database",
          resourceId: database.id,
          resourceName: database.name,
        })
      : Promise.resolve();

  const fail = async (detail: string) => {
    await db
      .update(databases)
      .set({ status: "error", statusDetail: detail.slice(0, 500) })
      .where(eq(databases.id, databaseId));
    await audit("failure", `Couldn't ${verb} database ${database.name}`, detail);
  };

  if (!server || server.status !== "connected") {
    await fail("The server isn't connected, so this action couldn't run.");
    return;
  }

  try {
    await runAgentCommand({
      serverId: server.id,
      name: `db.${action}`,
      payload:
        action === "remove"
          ? { containerName: database.containerName, removeVolume: true }
          : { containerName: database.containerName },
      onLog: () => {},
      timeoutMs: OPS_TIMEOUT_MS,
    });
  } catch (err) {
    await fail(err instanceof Error ? err.message : String(err));
    return;
  }

  if (action === "remove") {
    // The connection string we injected is meaningless now — drop it so a
    // redeploy can't start an app pointing at a database that's gone.
    if (database.projectId) {
      await db
        .delete(secrets)
        .where(
          and(
            eq(secrets.projectId, database.projectId),
            eq(secrets.key, database.connectionSecretKey),
            eq(secrets.source, "system"),
          ),
        );
    }
    await db.delete(databases).where(eq(databases.id, databaseId));
    await audit("success", `Deleted database ${database.name}`, "Container and data volume removed");
    return;
  }

  await db
    .update(databases)
    .set(
      action === "stop"
        ? { status: "stopped", statusDetail: null, isUp: false }
        // Freshly (re)started: health is unknown until the agent's next sample,
        // not "down" — that would flash a false alarm after every restart.
        : { status: "running", statusDetail: null, isUp: null },
    )
    .where(eq(databases.id, databaseId));
  await audit("success", `${past} database ${database.name}`);
}
