import type { HeartbeatEvent } from "@argo/shared-types";

/**
 * CPU/RAM/disk sampling for the heartbeat event (see docs/PHASE1_DESIGN.md
 * section 3). Real sampling (reading /proc, statvfs on the Docker data dir)
 * lands with PR2; this stub keeps the connect.ts heartbeat loop wireable
 * now.
 */
export async function sampleMetrics(): Promise<Omit<HeartbeatEvent, "type">> {
  return { cpuPercent: 0, memPercent: 0, diskPercent: 0 };
}
