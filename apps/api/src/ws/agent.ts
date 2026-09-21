import type { WSContext } from "hono/ws";
import { eq } from "drizzle-orm";
import { db, servers, recordAudit } from "@deplyr/db";
import { agentAuthSchema, agentEventSchema } from "@deplyr/shared-types";
import { recordHeartbeat } from "../lib/server-metrics";
import { recordDbStats } from "../lib/database-metrics";
import { agentConnected, agentDisconnected, registerConnectionCheck } from "../lib/server-alerts";
import {
  createSubscriberConnection,
  subscribeAgentCommands,
  publishAgentEvent,
} from "@deplyr/queue";

/**
 * Agent-facing WebSocket handler, mounted at /agent/ws. Agents always dial
 * out to this endpoint (never the reverse) — see docs/PHASE1_DESIGN.md
 * section 3 for the full protocol design.
 *
 * Kept in-process (single API instance) for Phase 1 — the connection
 * registry below only exists in this process's memory. Commands arrive
 * from apps/worker over the Redis bridge (section 5.4), since the job that
 * wants to send them runs in a different process than the one holding the
 * socket.
 */

const connectedAgents = new Map<string, WSContext>();
registerConnectionCheck((serverId) => connectedAgents.has(serverId));

export function getConnectedAgent(serverId: string): WSContext | undefined {
  return connectedAgents.get(serverId);
}

/** Called once at process startup (see src/index.ts) — routes commands
 * published by worker to whichever agent socket this process is holding. */
export function startAgentCommandBridge() {
  const subscriber = createSubscriberConnection();
  subscribeAgentCommands(subscriber, async ({ serverId, command }) => {
    const ws = connectedAgents.get(serverId);
    if (!ws) {
      await publishAgentEvent({
        serverId,
        event: {
          type: "result",
          requestId: command.requestId,
          status: "failure",
          detail: "agent is not connected",
        },
      });
      return;
    }
    ws.send(JSON.stringify(command));
  });
  return subscriber;
}

export function agentWsHandler() {
  // Per-connection state, captured in this closure — a fresh one of these
  // runs for each upgraded socket.
  let serverId: string | undefined;
  let authenticated = false;

  return {
    async onMessage(evt: MessageEvent, ws: WSContext) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(evt.data));
      } catch {
        ws.close(1008, "invalid JSON");
        return;
      }

      if (!authenticated) {
        const auth = agentAuthSchema.safeParse(parsed);
        if (!auth.success) {
          ws.close(1008, "expected auth message");
          return;
        }

        const [server] = await db
          .select()
          .from(servers)
          .where(eq(servers.id, auth.data.serverId));
        const valid =
          server?.agentTokenHash &&
          (await Bun.password.verify(auth.data.token, server.agentTokenHash));

        if (!server || !valid) {
          ws.close(1008, "invalid credentials");
          return;
        }

        serverId = server.id;
        authenticated = true;
        connectedAgents.set(serverId, ws);

        await db
          .update(servers)
          .set({
            status: "connected",
            statusDetail: null,
            agentConnectedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(servers.id, serverId));

        console.log(`[agent-ws] server ${serverId} authenticated`);
        await recordAudit({
          ownerId: server.userId,
          serverId: server.id,
          actor: "agent",
          action: "server.agent.connected",
          status: "success",
          summary: `Agent connected on ${server.name}`,
          resourceType: "server",
          resourceId: server.id,
          resourceName: server.name,
        });
        await agentConnected(server.id);
        return;
      }

      const event = agentEventSchema.safeParse(parsed);
      if (!event.success) {
        console.warn(`[agent-ws] malformed event from ${serverId}`, event.error);
        return;
      }

      // Fan every event out to worker over the bridge — log/result are
      // correlated there against an in-flight command. Heartbeat isn't
      // correlated to anything, but api already holds the DB connection
      // and the server id, so it's simplest to persist it right here
      // rather than round-tripping through worker for a single UPDATE.
      if (serverId) {
        await publishAgentEvent({ serverId, event: event.data });

        if (event.data.type === "heartbeat") {
          await db
            .update(servers)
            .set({
              cpuPercent: event.data.cpuPercent,
              memPercent: event.data.memPercent,
              diskPercent: event.data.diskPercent,
              metricsUpdatedAt: new Date(),
              // Older agents omit these — leave the stored value alone then.
              ...(event.data.cpuCores !== undefined && { cpuCores: event.data.cpuCores }),
              ...(event.data.memTotalMb !== undefined && { memTotalMb: event.data.memTotalMb }),
              ...(event.data.diskTotalGb !== undefined && { diskTotalGb: event.data.diskTotalGb }),
              ...(event.data.uptimeSeconds !== undefined && { uptimeSeconds: event.data.uptimeSeconds }),
              ...(event.data.loadAvg1 !== undefined && { loadAvg1: event.data.loadAvg1 }),
            })
            .where(eq(servers.id, serverId));
          await recordHeartbeat(serverId, event.data);
        }

        if (event.data.type === "db_stats") {
          await recordDbStats(serverId, event.data.samples);
        }
      }
    },

    async onClose() {
      if (!serverId) return;
      connectedAgents.delete(serverId);
      await db
        .update(servers)
        .set({
          status: "error",
          statusDetail: "Agent disconnected — waiting to reconnect",
          updatedAt: new Date(),
        })
        .where(eq(servers.id, serverId));
      console.warn(`[agent-ws] server ${serverId} disconnected`);
      agentDisconnected(serverId);

      const [server] = await db.select().from(servers).where(eq(servers.id, serverId));
      if (server) {
        await recordAudit({
          ownerId: server.userId,
          serverId: server.id,
          actor: "agent",
          action: "server.agent.disconnected",
          status: "failure",
          summary: `Agent disconnected from ${server.name}`,
          detail: "Waiting for it to reconnect",
          resourceType: "server",
          resourceId: server.id,
          resourceName: server.name,
        });
      }
    },
  };
}
