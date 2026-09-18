import { mkdir, rm } from "node:fs/promises";
import type { DeployCloneCommandPayload } from "@argo/shared-types";
import { runProcess } from "../lib/run-process";

export async function clone(
  payload: Record<string, unknown>,
  emitLog: (line: string) => void,
): Promise<void> {
  const { cloneUrl, branch, srcDir } = payload as unknown as DeployCloneCommandPayload;

  await rm(srcDir, { recursive: true, force: true });
  await mkdir(srcDir, { recursive: true });

  // cloneUrl has a short-lived GitHub token embedded — never let the raw
  // command line (with that token) reach deploy_steps.log.
  const redactedUrl = cloneUrl.replace(/https:\/\/[^@]+@/, "https://***@");

  await runProcess(
    ["git", "clone", "--branch", branch, "--depth", "1", cloneUrl, srcDir],
    emitLog,
    {
      displayCmd: ["git", "clone", "--branch", branch, "--depth", "1", redactedUrl, srcDir],
    },
  );
}
