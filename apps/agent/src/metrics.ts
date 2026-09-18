import { readFile, statfs } from "node:fs/promises";
import type { HeartbeatEvent } from "@argo/shared-types";

/**
 * CPU/RAM/disk sampling for the heartbeat event (see docs/PHASE1_DESIGN.md
 * section 3) — server-level, not per-app (there's no per-app metrics
 * protocol in Phase 1; see the PR7 notes for why).
 */

interface CpuSample {
  idle: number;
  total: number;
}

let previousCpuSample: CpuSample | null = null;

export async function sampleMetrics(): Promise<Omit<HeartbeatEvent, "type">> {
  const [cpuPercent, memPercent, diskPercent] = await Promise.all([
    sampleCpuPercent(),
    sampleMemPercent(),
    sampleDiskPercent(),
  ]);
  return { cpuPercent, memPercent, diskPercent };
}

// Delta against the previous heartbeat's reading rather than sleeping
// mid-sample — the ~15s gap between heartbeats is plenty of a window.
async function sampleCpuPercent(): Promise<number> {
  try {
    const stat = await readFile("/proc/stat", "utf8");
    const cpuLine = stat.split("\n").find((line) => line.startsWith("cpu "));
    if (!cpuLine) return 0;

    const fields = cpuLine.trim().split(/\s+/).slice(1).map(Number);
    const [user = 0, nice = 0, system = 0, idle = 0, iowait = 0, irq = 0, softirq = 0, steal = 0] =
      fields;
    const sample: CpuSample = {
      idle: idle + iowait,
      total: user + nice + system + idle + iowait + irq + softirq + steal,
    };

    const previous = previousCpuSample;
    previousCpuSample = sample;
    if (!previous) return 0;

    const idleDelta = sample.idle - previous.idle;
    const totalDelta = sample.total - previous.total;
    if (totalDelta <= 0) return 0;

    return clampPercent(100 * (1 - idleDelta / totalDelta));
  } catch {
    return 0;
  }
}

async function sampleMemPercent(): Promise<number> {
  try {
    const raw = await readFile("/proc/meminfo", "utf8");
    const values = Object.fromEntries(
      raw
        .split("\n")
        .map((line) => line.match(/^(\w+):\s+(\d+)/))
        .filter((match): match is RegExpMatchArray => match !== null)
        .map((match) => [match[1], Number(match[2])]),
    );

    const total = values.MemTotal;
    const available = values.MemAvailable;
    if (!total) return 0;

    return clampPercent(100 * (1 - (available ?? 0) / total));
  } catch {
    return 0;
  }
}

async function sampleDiskPercent(): Promise<number> {
  try {
    const stats = await statfs("/var/lib/argo");
    if (stats.blocks === 0) return 0;
    return clampPercent(100 * (1 - stats.bfree / stats.blocks));
  } catch {
    return 0;
  }
}

function clampPercent(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)));
}
