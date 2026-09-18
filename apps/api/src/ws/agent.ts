import type { WSContext } from "hono/ws";

/**
 * Agent-facing WebSocket handler, mounted at /agent/ws. Agents always dial
 * out to this endpoint (never the reverse) — see docs/PHASE1_DESIGN.md
 * section 3 for the full protocol design.
 *
 * This is the connection-registry skeleton only. PR2 fills in: the
 * `{type:"auth"}` handshake verified against `servers.agent_token_hash`,
 * routing `{type:"command"}` messages to the right socket by requestId, and
 * persisting heartbeat/log events. Kept in-process (single API instance) for
 * Phase 1; moving to Redis pub/sub for multi-instance scaling is a Phase 2
 * concern noted in the design doc.
 */

const connectedAgents = new Map<string, WSContext>();

export function agentWsHandler() {
  return {
    onOpen(_evt: Event, _ws: WSContext) {
      // Connection opens unauthenticated; PR2 closes it if the first
      // message isn't a valid `{type:"auth"}` handshake.
    },
    onMessage(evt: MessageEvent, _ws: WSContext) {
      // PR2: parse with agentAuthSchema / commandSchema from
      // @argo/shared-types and dispatch (auth -> register in
      // connectedAgents, log/result/heartbeat -> persist + fan out).
      console.log("[agent-ws] message received", evt.data);
    },
    onClose(_evt: CloseEvent, ws: WSContext) {
      for (const [serverId, socket] of connectedAgents) {
        if (socket === ws) connectedAgents.delete(serverId);
      }
    },
  };
}

export function getConnectedAgent(serverId: string): WSContext | undefined {
  return connectedAgents.get(serverId);
}
