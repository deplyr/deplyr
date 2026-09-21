import type { DeploySummary } from "@deplyr/shared-types";

export function deployDuration(d: Pick<DeploySummary, "startedAt" | "finishedAt">): string | null {
  if (!d.startedAt || !d.finishedAt) return null;
  const s = Math.max(0, Math.round((new Date(d.finishedAt).getTime() - new Date(d.startedAt).getTime()) / 1000));
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

export const stripTone = {
  success: "bg-success",
  failed: "bg-danger",
  running: "bg-warning animate-pulse",
  queued: "bg-white/20",
} as const;
