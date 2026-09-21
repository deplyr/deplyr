export interface CaptureResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  /** Wall-clock time the process took, in ms. */
  elapsedMs: number;
}

/** Runs `cmd` and returns its output instead of streaming it — for probes
 * that parse a result. Kills the process after `timeoutMs` so a wedged
 * database can't stall the stats loop. */
export async function captureProcess(cmd: string[], timeoutMs = 5_000): Promise<CaptureResult> {
  const started = performance.now();
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const timer = setTimeout(() => proc.kill(), timeoutMs);

  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { stdout, stderr, exitCode, elapsedMs: Math.round(performance.now() - started) };
  } finally {
    clearTimeout(timer);
  }
}
