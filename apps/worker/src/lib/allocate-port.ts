import { isNotNull } from "drizzle-orm";
import { db, projects } from "@argo/db";

const PORT_RANGE_START = 20000;
const PORT_RANGE_END = 29999;

/** Every app on a box uses --network host (see docs/PHASE1_DESIGN.md
 * section 5.1), so ports must be distinct across all of a box's projects
 * — checked globally here since Phase 1 only ever targets one box anyway. */
export async function allocatePort(): Promise<number> {
  const rows = await db
    .select({ appPort: projects.appPort })
    .from(projects)
    .where(isNotNull(projects.appPort));
  const taken = new Set(rows.map((r) => r.appPort));

  for (let attempt = 0; attempt < 50; attempt++) {
    const port =
      PORT_RANGE_START + Math.floor(Math.random() * (PORT_RANGE_END - PORT_RANGE_START));
    if (!taken.has(port)) return port;
  }
  throw new Error("could not allocate a port after 50 attempts");
}
