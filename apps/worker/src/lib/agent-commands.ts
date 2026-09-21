import { randomUUID } from "node:crypto";
import type IORedis from "ioredis";
import {
  createSubscriberConnection,
  subscribeAgentEvents,
  publishAgentCommand,
  type AgentEventMessage,
} from "@deplyr/queue";
import type { Command } from "@deplyr/shared-types";

/**
 * Sends one "deploy.<step>" command to an agent over the Redis bridge (see
 * docs/PHASE1_DESIGN.md section 5.4) and resolves once that agent reports
 * success or failure for it — streaming any log lines it sends in the
 * meantime to `onLog`. One shared subscriber connection + a
 * requestId -> pending-request map for the whole worker process, since
 * correlation is by requestId regardless of how many commands are in
 * flight at once.
 */

interface PendingRequest {
  onLog: (line: string) => void;
  resolve: () => void;
  reject: (err: Error) => void;
}

const pending = new Map<string, PendingRequest>();
let subscriber: IORedis | undefined;

function ensureSubscriber() {
  if (subscriber) return;
  subscriber = createSubscriberConnection();
  subscribeAgentEvents(subscriber, (message: AgentEventMessage) => {
    const { event } = message;
    // Periodic telemetry, not part of any command's conversation.
    if (event.type === "heartbeat" || event.type === "db_stats") return;

    const entry = pending.get(event.requestId);
    if (!entry) return; // stale, or nobody in this process is waiting on it

    if (event.type === "log") {
      entry.onLog(event.line);
      return;
    }

    pending.delete(event.requestId);
    if (event.status === "success") {
      entry.resolve();
    } else {
      entry.reject(new Error(event.detail ?? "command failed"));
    }
  });
}

export interface RunAgentCommandOptions {
  serverId: string;
  name: string;
  payload: Record<string, unknown>;
  onLog: (line: string) => void;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes — a build can be slow

export async function runAgentCommand(options: RunAgentCommandOptions): Promise<void> {
  ensureSubscriber();
  const requestId = randomUUID();
  const command: Command = {
    type: "command",
    requestId,
    name: options.name,
    payload: options.payload,
  };

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error(`command "${options.name}" timed out`));
    }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    pending.set(requestId, {
      onLog: options.onLog,
      resolve: () => {
        clearTimeout(timeout);
        resolve();
      },
      reject: (err) => {
        clearTimeout(timeout);
        reject(err);
      },
    });

    publishAgentCommand({ serverId: options.serverId, command }).catch((err: unknown) => {
      clearTimeout(timeout);
      pending.delete(requestId);
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });
}
