import type { Command } from "@argo/shared-types";

export type CommandHandler = (payload: Record<string, unknown>) => Promise<void>;

/**
 * Deploy-step command handlers, dispatched by name ("deploy.clone",
 * "deploy.install", ...). Each is implemented in PR5 alongside the deploy
 * pipeline; registering the map here now is what lets connect.ts route
 * commands without changing once the real steps land.
 */
export const commandHandlers: Partial<Record<string, CommandHandler>> = {};

export async function dispatchCommand(command: Command): Promise<void> {
  const handler = commandHandlers[command.name];
  if (!handler) {
    throw new Error(`no handler registered for command "${command.name}"`);
  }
  await handler(command.payload);
}
