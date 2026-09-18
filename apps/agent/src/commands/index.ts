import type { Command } from "@argo/shared-types";
import { clone } from "./clone";
import { install } from "./install";
import { build } from "./build";
import { writeEnv } from "./write-env";
import { start } from "./start";
import { nginx } from "./nginx";
import { ssl } from "./ssl";
import { healthCheck } from "./health-check";

export type CommandHandler = (
  payload: Record<string, unknown>,
  emitLog: (line: string) => void,
) => Promise<void>;

/** Deploy-step command handlers, dispatched by name ("deploy.clone",
 * "deploy.install", ...) — see docs/PHASE1_DESIGN.md sections 4 and 5. */
export const commandHandlers: Partial<Record<string, CommandHandler>> = {
  "deploy.clone": clone,
  "deploy.install": install,
  "deploy.build": build,
  "deploy.write_env": writeEnv,
  "deploy.start": start,
  "deploy.nginx": nginx,
  "deploy.ssl": ssl,
  "deploy.health_check": healthCheck,
};

export async function dispatchCommand(
  command: Command,
  emitLog: (line: string) => void,
): Promise<void> {
  const handler = commandHandlers[command.name];
  if (!handler) {
    throw new Error(`no handler registered for command "${command.name}"`);
  }
  await handler(command.payload, emitLog);
}
