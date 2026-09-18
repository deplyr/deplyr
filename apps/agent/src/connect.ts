import {
  agentAuthSchema,
  commandSchema,
  type AgentEvent,
} from "@argo/shared-types";
import { dispatchCommand } from "./commands";
import { sampleMetrics } from "./metrics";

const HEARTBEAT_INTERVAL_MS = 15_000;
const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

/**
 * Outbound, auto-reconnecting WebSocket client to the control plane. The
 * agent always dials out (see docs/PHASE1_DESIGN.md section 3) — this file
 * owns that connection's whole lifecycle: auth handshake, heartbeats,
 * inbound command dispatch, and reconnect-with-backoff on drop.
 */
export function connectToControlPlane() {
  const url = requiredEnv("ARGO_CONTROL_PLANE_WS");
  const serverId = requiredEnv("ARGO_SERVER_ID");
  const token = requiredEnv("ARGO_TOKEN");

  let backoff = INITIAL_BACKOFF_MS;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

  function open() {
    const ws = new WebSocket(url);

    ws.addEventListener("open", () => {
      backoff = INITIAL_BACKOFF_MS;
      send(ws, agentAuthSchema.parse({ type: "auth", serverId, token }));

      heartbeatTimer = setInterval(async () => {
        const metrics = await sampleMetrics();
        send(ws, { type: "heartbeat", ...metrics } satisfies AgentEvent);
      }, HEARTBEAT_INTERVAL_MS);
    });

    ws.addEventListener("message", async (evt) => {
      const parsed = commandSchema.safeParse(JSON.parse(String(evt.data)));
      if (!parsed.success) {
        console.error("[agent] received malformed command", parsed.error);
        return;
      }
      try {
        await dispatchCommand(parsed.data, (line) => {
          send(ws, {
            type: "log",
            requestId: parsed.data.requestId,
            line,
          } satisfies AgentEvent);
        });
        send(ws, {
          type: "result",
          requestId: parsed.data.requestId,
          status: "success",
        } satisfies AgentEvent);
      } catch (err) {
        send(ws, {
          type: "result",
          requestId: parsed.data.requestId,
          status: "failure",
          detail: err instanceof Error ? err.message : String(err),
        } satisfies AgentEvent);
      }
    });

    ws.addEventListener("close", () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      console.warn(`[agent] disconnected, retrying in ${backoff}ms`);
      setTimeout(open, backoff);
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    });

    ws.addEventListener("error", (evt) => {
      console.error("[agent] connection error", evt);
    });
  }

  open();
}

function send(ws: WebSocket, event: AgentEvent | ReturnType<typeof agentAuthSchema.parse>) {
  ws.send(JSON.stringify(event));
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}
