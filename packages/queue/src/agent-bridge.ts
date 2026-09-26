import IORedis from "ioredis";
import type { Command, AgentEvent } from "@deplyr/shared-types";
import { getRedisConnection } from "./connection";

/**
 * Bridges apps/api (owns the agent WebSocket connections, in-process) and
 * apps/worker (runs the deploy job that needs to send commands and wait on
 * results/logs) — two separate processes even in single-instance Phase 1.
 * See docs/architecture.md for why this exists and why it's
 * plain pub/sub rather than another BullMQ queue.
 */

export const AGENT_COMMANDS_CHANNEL = "agent:commands";
export const AGENT_EVENTS_CHANNEL = "agent:events";

export interface AgentCommandMessage {
  serverId: string;
  command: Command;
}

export interface AgentEventMessage {
  serverId: string;
  event: AgentEvent;
}

function redisUrl(): string {
  return process.env.REDIS_URL ?? "redis://localhost:6379";
}

/**
 * A dedicated connection for pub/sub. Once `.subscribe()` is called on an
 * ioredis connection it can no longer run ordinary commands — this must
 * never be the shared connection from ./connection.ts.
 */
export function createSubscriberConnection(): IORedis {
  return new IORedis(redisUrl());
}

export async function publishAgentCommand(message: AgentCommandMessage): Promise<void> {
  await getRedisConnection().publish(AGENT_COMMANDS_CHANNEL, JSON.stringify(message));
}

export async function publishAgentEvent(message: AgentEventMessage): Promise<void> {
  await getRedisConnection().publish(AGENT_EVENTS_CHANNEL, JSON.stringify(message));
}

export function subscribeAgentCommands(
  subscriber: IORedis,
  onMessage: (message: AgentCommandMessage) => void,
): void {
  subscriber.subscribe(AGENT_COMMANDS_CHANNEL);
  subscriber.on("message", (channel: string, raw: string) => {
    if (channel !== AGENT_COMMANDS_CHANNEL) return;
    try {
      onMessage(JSON.parse(raw) as AgentCommandMessage);
    } catch (err) {
      console.error("[agent-bridge] malformed command message", err);
    }
  });
}

export function subscribeAgentEvents(
  subscriber: IORedis,
  onMessage: (message: AgentEventMessage) => void,
): void {
  subscriber.subscribe(AGENT_EVENTS_CHANNEL);
  subscriber.on("message", (channel: string, raw: string) => {
    if (channel !== AGENT_EVENTS_CHANNEL) return;
    try {
      onMessage(JSON.parse(raw) as AgentEventMessage);
    } catch (err) {
      console.error("[agent-bridge] malformed event message", err);
    }
  });
}
