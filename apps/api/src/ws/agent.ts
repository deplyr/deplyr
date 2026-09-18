import type { WSContext } from "hono/ws";
import { eq } from "drizzle-orm";
import { db, servers } from "@argo/db";
import { agentAuthSchema, agentEventSchema } from "@argo/shared-types";

/**
 * Agent-facing WebSocket handler, mounted at /agent/ws. Agents always dial
 * out to this endpoint (never the reverse) — see docs/PHASE1_DESIGN.md
 * section 3 for the full protocol design.
 *
 * Kept in-process (single API instance) for Phase 1; moving to Redis
 * pub/sub for multi-instance scaling is a Phase 2 concern.
 */

const connectedAgents = new Map<string, WSContext>();

export function getConnectedAgent(serverId: string): WSContext | undefined {
  return connectedAgents.get(serverId);
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
        return;
      }

      const event = agentEventSchema.safeParse(parsed);
      if (!event.success) {
        console.warn(`[agent-ws] malformed event from ${serverId}`, event.error);
        return;
      }

      switch (event.data.type) {
        case "heartbeat":
          // Phase 1: the open connection is itself the liveness signal.
          // Persisting CPU/RAM/disk history is PR7 (monitoring dashboard).
          break;
        case "log":
        case "result":
          // No commands are sent yet — that's PR5's deploy pipeline — so
          // there's nothing in flight for these to correlate against.
          break;
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
    },
  };
}
