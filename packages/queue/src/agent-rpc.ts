import { randomUUID } from "node:crypto";
import type IORedis from "ioredis";
import type { Command } from "@deplyr/shared-types";
import { createSubscriberConnection, publishAgentCommand, subscribeAgentEvents } from "./agent-bridge";

/**
 * Send one command to an agent over the Redis bridge and collect what it
 * says back — for request/response uses (fetching logs) where the caller
 * wants the lines as a value. Long-running, streaming callers such as the
 * deploy job keep using their own runner (apps/worker/src/lib/agent-commands.ts);
 * this is the small, timeout-first variant.
 *
 * One shared subscriber per process; replies are matched by requestId.
 */

interface Pending {
  lines: string[];
  resolve: (lines: string[]) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const pending = new Map<string, Pending>();
let subscriber: IORedis | undefined;

function ensureSubscriber() {
  if (subscriber) return;
  subscriber = createSubscriberConnection();
  subscribeAgentEvents(subscriber, ({ event }) => {
    if (event.type === "heartbeat" || event.type === "db_stats") return;
    const entry = pending.get(event.requestId);
    if (!entry) return; // someone else's request, or one that already timed out

    if (event.type === "log") {
      entry.lines.push(event.line);
      return;
    }
    pending.delete(event.requestId);
    clearTimeout(entry.timer);
    if (event.status === "success") entry.resolve(entry.lines);
    else entry.reject(new Error(event.detail ?? "command failed"));
  });
}

export async function runAgentCommandCollect(options: {
  serverId: string;
  name: string;
  payload: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<string[]> {
  ensureSubscriber();
  const requestId = randomUUID();
  const command: Command = { type: "command", requestId, name: options.name, payload: options.payload };

  return new Promise<string[]>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error(`command "${options.name}" timed out`));
    }, options.timeoutMs ?? 12_000);
    pending.set(requestId, { lines: [], resolve, reject, timer });

    publishAgentCommand({ serverId: options.serverId, command }).catch((err: unknown) => {
      clearTimeout(timer);
      pending.delete(requestId);
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });
}
