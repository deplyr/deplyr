import { eq } from "drizzle-orm";
import { db, databases, projects } from "@deplyr/db";
import { DATABASE_DEFAULT_PORTS, type DatabaseType } from "@deplyr/shared-types";

const AUTO_RANGE_START = 30_000;
const AUTO_RANGE_END = 39_999;
// Ports a box almost certainly uses for something else already.
const RESERVED = new Set([22, 25, 80, 443, 2375, 2376]);

/** Ports Deplyr itself has handed out on this server, and to what. */
async function takenPorts(serverId: string): Promise<Map<number, string>> {
  const [dbRows, appRows] = await Promise.all([
    db.select({ port: databases.port, name: databases.name }).from(databases).where(eq(databases.serverId, serverId)),
    db.select({ port: projects.appPort, name: projects.name }).from(projects).where(eq(projects.serverId, serverId)),
  ]);
  const taken = new Map<number, string>();
  for (const r of dbRows) if (r.port) taken.set(r.port, `database "${r.name}"`);
  for (const r of appRows) if (r.port) taken.set(r.port, `project "${r.name}"`);
  return taken;
}

export type PortChoice = { port: number } | { error: string };

/**
 * A requested port is honoured or rejected with a reason — never silently
 * swapped. With no request: the engine's own default port if it's free
 * (what people expect to see), otherwise a random one from a high range.
 *
 * This only knows about ports Deplyr allocated. Something else already
 * listening on the box surfaces later, as the container failing to start.
 */
export async function pickDatabasePort(
  serverId: string,
  type: DatabaseType,
  requested?: number,
): Promise<PortChoice> {
  const taken = await takenPorts(serverId);

  if (requested !== undefined) {
    if (RESERVED.has(requested)) return { error: `Port ${requested} is reserved for system services.` };
    const owner = taken.get(requested);
    if (owner) return { error: `Port ${requested} is already used by ${owner}.` };
    return { port: requested };
  }

  const preferred = DATABASE_DEFAULT_PORTS[type];
  if (!taken.has(preferred)) return { port: preferred };

  for (let i = 0; i < 100; i++) {
    const port = AUTO_RANGE_START + Math.floor(Math.random() * (AUTO_RANGE_END - AUTO_RANGE_START + 1));
    if (!taken.has(port)) return { port };
  }
  return { error: "Couldn't find a free port — pick one manually." };
}
