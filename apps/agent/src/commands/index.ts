import type { Command } from "@deplyr/shared-types";
import { clone } from "./clone";
import { install } from "./install";
import { build } from "./build";
import { writeEnv } from "./write-env";
import { start } from "./start";
import { nginx } from "./nginx";
import { ssl } from "./ssl";
import { healthCheck } from "./health-check";
import { dbProvision } from "./db-provision";
import { dbStart, dbStop, dbRestart, dbRemove } from "./db-lifecycle";
import { logsContainer } from "./logs";
import { dbExec } from "./db-exec";
import { domainConfigureHttp, domainIssueCert, domainRemove, domainRenewAll } from "./domain";

/** A handler may return a short string that becomes the result's `detail` on
 * success — e.g. whether HTTPS actually got configured, a cert's expiry.
 * Most handlers return nothing, which is the same as returning undefined. */
export type CommandHandler = (
  payload: Record<string, unknown>,
  emitLog: (line: string) => void,
) => Promise<string | void>;

/** Command handlers, dispatched by name — deploy-step commands
 * ("deploy.clone", "deploy.install", ...) per docs/architecture.md
 * sections 4 and 5, plus the "db.*" database commands. */
export const commandHandlers: Partial<Record<string, CommandHandler>> = {
  "deploy.clone": clone,
  "deploy.install": install,
  "deploy.build": build,
  "deploy.write_env": writeEnv,
  "deploy.start": start,
  "deploy.nginx": nginx,
  "deploy.ssl": ssl,
  "deploy.health_check": healthCheck,
  "db.provision": dbProvision,
  "db.start": dbStart,
  "db.stop": dbStop,
  "db.restart": dbRestart,
  "db.remove": dbRemove,
  "db.exec": dbExec,
  "logs.container": logsContainer,
  "domain.configureHttp": domainConfigureHttp,
  "domain.issueCert": domainIssueCert,
  "domain.remove": domainRemove,
  "domain.renewAll": domainRenewAll,
};

export async function dispatchCommand(
  command: Command,
  emitLog: (line: string) => void,
): Promise<string | void> {
  const handler = commandHandlers[command.name];
  if (!handler) {
    throw new Error(`no handler registered for command "${command.name}"`);
  }
  return handler(command.payload, emitLog);
}
