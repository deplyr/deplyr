import { isNotNull } from "drizzle-orm";
import { db, projects, databases } from "@argo/db";

const APP_PORT_RANGE_START = 20000;
const APP_PORT_RANGE_END = 29999;

const DB_PORT_RANGE_START = 30000;
const DB_PORT_RANGE_END = 39999;

async function allocateFromRange(
  taken: Set<number | null>,
  rangeStart: number,
  rangeEnd: number,
): Promise<number> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const port = rangeStart + Math.floor(Math.random() * (rangeEnd - rangeStart));
    if (!taken.has(port)) return port;
  }
  throw new Error("could not allocate a port after 50 attempts");
}

/** Every app on a box uses --network host (see docs/PHASE1_DESIGN.md
 * section 5.1), so ports must be distinct across all of a box's projects
 * — checked globally here since Phase 1 only ever targets one box anyway. */
export async function allocatePort(): Promise<number> {
  const rows = await db
    .select({ appPort: projects.appPort })
    .from(projects)
    .where(isNotNull(projects.appPort));
  return allocateFromRange(new Set(rows.map((r) => r.appPort)), APP_PORT_RANGE_START, APP_PORT_RANGE_END);
}

/** A disjoint range from allocatePort's — database containers use bridge
 * networking with a published loopback port, not --network host (a
 * deliberate difference, see section 5.1), but ports still have to be
 * unique per box either way. */
export async function allocateDbPort(): Promise<number> {
  const rows = await db.select({ port: databases.port }).from(databases);
  return allocateFromRange(new Set(rows.map((r) => r.port)), DB_PORT_RANGE_START, DB_PORT_RANGE_END);
}
