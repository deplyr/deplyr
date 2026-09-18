import type { WSContext } from "hono/ws";

/**
 * UI-facing WebSocket handler, mounted at /deploys/:id/logs/ws. Subscribers
 * (the web dashboard, watching one deploy) get log lines fanned out here as
 * the agent streams them in over ws/agent.ts. Implemented fully in PR5
 * alongside the deploy pipeline.
 */

const subscribers = new Map<string, Set<WSContext>>();

export function logsWsHandler(deployId: string) {
  return {
    onOpen(_evt: Event, ws: WSContext) {
      const set = subscribers.get(deployId) ?? new Set<WSContext>();
      set.add(ws);
      subscribers.set(deployId, set);
    },
    onClose(_evt: CloseEvent, ws: WSContext) {
      subscribers.get(deployId)?.delete(ws);
    },
  };
}

export function broadcastLogLine(deployId: string, line: string) {
  for (const ws of subscribers.get(deployId) ?? []) {
    ws.send(JSON.stringify({ line }));
  }
}
