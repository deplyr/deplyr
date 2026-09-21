import { isNotNull } from "drizzle-orm";
import { db, projects } from "@deplyr/db";

const APP_PORT_RANGE_START = 20000;
const APP_PORT_RANGE_END = 29999;

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
