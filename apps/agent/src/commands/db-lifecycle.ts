import type { DbLifecyclePayload, DbRemovePayload } from "@deplyr/shared-types";
import { runProcess } from "../lib/run-process";
import { volumeFor } from "./db-provision";

const lifecycle =
  (verb: "start" | "stop" | "restart") =>
  async (payload: Record<string, unknown>, emitLog: (line: string) => void) => {
    const { containerName } = payload as unknown as DbLifecyclePayload;
    await runProcess(["docker", verb, containerName], emitLog);
  };

export const dbStart = lifecycle("start");
export const dbStop = lifecycle("stop");
export const dbRestart = lifecycle("restart");

export async function dbRemove(
  payload: Record<string, unknown>,
  emitLog: (line: string) => void,
): Promise<void> {
  const { containerName, removeVolume } = payload as unknown as DbRemovePayload;
  // -f: an already-gone container is the state we want, not an error.
  await runProcess(["docker", "rm", "-f", containerName], emitLog).catch(() => {});
  if (removeVolume) {
    await runProcess(["docker", "volume", "rm", "-f", volumeFor(containerName)], emitLog);
  }
}
