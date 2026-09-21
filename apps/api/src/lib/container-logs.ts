import { runAgentCommandCollect } from "@deplyr/queue";
import {
  LOG_TAIL_DEFAULT,
  LOG_TAIL_MAX,
  dockerTsToNs,
  parseWireLine,
  type ContainerLogs,
  type ContainerState,
  type LogLine,
  type LogsCommandPayload,
} from "@deplyr/shared-types";
import { getConnectedAgent } from "../ws/agent";

export class LogsUnavailableError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 502 | 503,
  ) {
    super(message);
  }
}

/** ?tail= -> a number in [1, LOG_TAIL_MAX]; junk falls back to the default. */
export function parseTail(raw: string | undefined): number {
  const n = Math.trunc(Number(raw));
  return Number.isFinite(n) && n > 0 ? Math.min(n, LOG_TAIL_MAX) : LOG_TAIL_DEFAULT;
}

const MISSING_MESSAGE =
  "This container doesn't exist on the server right now — it may never have started, or it was removed.";

/**
 * Ask the agent on `serverId` for a container's recent output. Failures the
 * user can act on become LogsUnavailableError with a sentence to show them;
 * a container that's simply gone or stopped is a normal answer, not an error.
 */
export async function fetchContainerLogs(params: {
  serverId: string;
  containerName: string;
  tail: number;
  since?: string;
}): Promise<ContainerLogs> {
  if (params.since && dockerTsToNs(params.since) === null) {
    throw new LogsUnavailableError("since must be an RFC3339 timestamp", 400);
  }
  // Checked up front so the caller gets an instant answer instead of waiting
  // out a command timeout for an agent that isn't there.
  if (!getConnectedAgent(params.serverId)) {
    throw new LogsUnavailableError("The server's agent isn't connected, so logs can't be fetched right now.", 503);
  }

  const payload: LogsCommandPayload = { containerName: params.containerName, tail: params.tail, since: params.since };
  let raw: string[];
  try {
    raw = await runAgentCommandCollect({
      serverId: params.serverId,
      name: "logs.container",
      payload: payload as unknown as Record<string, unknown>,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    if (/timed out/i.test(detail)) {
      throw new LogsUnavailableError("The server took too long to answer. Try again in a moment.", 503);
    }
    if (/no handler registered/i.test(detail)) {
      throw new LogsUnavailableError("This server's agent is out of date and can't fetch logs yet. Reconnect the server to update it.", 502);
    }
    throw new LogsUnavailableError(`Couldn't read logs from the server: ${detail}`, 502);
  }

  let state: ContainerState = "missing";
  const lines: LogLine[] = [];
  for (const line of raw) {
    const parsed = parseWireLine(line);
    if (!parsed) continue;
    if (parsed.kind === "state") state = parsed.state;
    else lines.push(parsed.line);
  }

  return {
    lines,
    nextSince: lines[lines.length - 1]?.ts ?? params.since ?? null,
    containerRunning: state === "running",
    containerState: state,
    message: state === "missing" ? MISSING_MESSAGE : null,
  };
}
