import type { DeployHealthCheckCommandPayload } from "@argo/shared-types";

const MAX_ATTEMPTS = 10;
const RETRY_DELAY_MS = 2000;

export async function healthCheck(
  payload: Record<string, unknown>,
  emitLog: (line: string) => void,
): Promise<void> {
  const { port, path } = payload as unknown as DeployHealthCheckCommandPayload;
  const url = `http://127.0.0.1:${port}${path}`;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      emitLog(`attempt ${attempt}/${MAX_ATTEMPTS}: HTTP ${res.status}`);
      if (res.ok) return;
    } catch (err) {
      emitLog(
        `attempt ${attempt}/${MAX_ATTEMPTS}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }

  throw new Error(`app did not respond with a successful status at ${url}`);
}
