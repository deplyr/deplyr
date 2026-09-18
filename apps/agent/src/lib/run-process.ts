export interface RunProcessOptions {
  cwd?: string;
  env?: Record<string, string>;
  /** Shown in the "$ ..." log line instead of `cmd` — use this whenever
   * `cmd` carries a credential (e.g. a clone URL with an embedded token)
   * that must never reach deploy_steps.log. */
  displayCmd?: string[];
}

/** Runs `cmd`, streaming stdout/stderr to `emitLog` line by line, and
 * throws if it exits non-zero. */
export async function runProcess(
  cmd: string[],
  emitLog: (line: string) => void,
  opts: RunProcessOptions = {},
): Promise<void> {
  emitLog(`$ ${(opts.displayCmd ?? cmd).join(" ")}`);

  const proc = Bun.spawn(cmd, {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    stdout: "pipe",
    stderr: "pipe",
  });

  await Promise.all([
    pipeToLog(proc.stdout, emitLog),
    pipeToLog(proc.stderr, emitLog),
  ]);

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`${cmd[0]} exited with code ${exitCode}`);
  }
}

async function pipeToLog(
  stream: ReadableStream<Uint8Array>,
  emitLog: (line: string) => void,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.length > 0) emitLog(line);
    }
  }
  if (buffer.length > 0) emitLog(buffer);
}
