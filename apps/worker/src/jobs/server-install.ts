import type { Job } from "bullmq";
import { randomBytes } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { db, servers, decryptSecret } from "@argo/db";
import type { ServerInstallJob } from "@argo/queue";
import { sshExec } from "../lib/ssh-exec";

const AGENT_CONNECT_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 2_000;

/**
 * SSHes into the user's VPS, installs Docker + the Argo agent, and waits
 * for the agent to dial back in and authenticate. See
 * docs/PHASE1_DESIGN.md section 3 for the full registration flow — this is
 * the worker side of it; apps/api/src/ws/agent.ts is the other half (it
 * flips status to "connected" once the agent authenticates).
 */
export async function processServerInstall(job: Job<ServerInstallJob>) {
  const { serverId } = job.data;
  const [server] = await db.select().from(servers).where(eq(servers.id, serverId));
  if (!server) {
    console.error(`[worker] server:install — server ${serverId} not found`);
    return;
  }

  try {
    await setStatus(serverId, "Connecting via SSH...");

    const credentialPlaintext = decryptSecret(server.sshCredential);
    const token = randomBytes(32).toString("hex");
    const tokenHash = await Bun.password.hash(token, { algorithm: "argon2id" });

    await db
      .update(servers)
      .set({ agentTokenHash: tokenHash, updatedAt: new Date() })
      .where(eq(servers.id, serverId));

    await setStatus(serverId, "Installing Docker and starting the Argo agent...");

    const script = [
      `export ARGO_TOKEN='${token}'`,
      `export ARGO_SERVER_ID='${serverId}'`,
      `export ARGO_CONTROL_PLANE_WS='${requiredEnv("ARGO_CONTROL_PLANE_WS")}'`,
      await readInstallScript(),
    ].join("\n");

    const result = await sshExec(
      server.ipAddress,
      { type: server.sshCredentialType, value: credentialPlaintext },
      script,
    );

    if (result.exitCode !== 0) {
      await setStatus(
        serverId,
        `Agent install failed (exit code ${result.exitCode}): ${lastLine(result.output)}`,
        "error",
      );
      return;
    }

    await db
      .update(servers)
      .set({ dockerInstalled: true, updatedAt: new Date() })
      .where(eq(servers.id, serverId));

    await setStatus(serverId, "Waiting for the agent to connect...");

    const connected = await waitForConnection(serverId, AGENT_CONNECT_TIMEOUT_MS);
    if (!connected) {
      await setStatus(
        serverId,
        "Timed out waiting for the agent to connect. Check that the server allows outbound HTTPS/WebSocket traffic.",
        "error",
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await setStatus(serverId, `Could not connect: ${message}`, "error");
  }
}

// Guarded against ever downgrading a server that has already connected —
// ws/agent.ts (a different process) can flip status to "connected" while
// this job is mid-flight; this job should never stomp on that.
async function setStatus(
  serverId: string,
  statusDetail: string,
  status: "installing" | "error" = "installing",
) {
  await db
    .update(servers)
    .set({ status, statusDetail, updatedAt: new Date() })
    .where(and(eq(servers.id, serverId), ne(servers.status, "connected")));
}

async function waitForConnection(serverId: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [server] = await db.select().from(servers).where(eq(servers.id, serverId));
    if (server?.status === "connected") return true;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return false;
}

async function readInstallScript(): Promise<string> {
  const url = new URL("../../../../infra/agent-install.sh", import.meta.url);
  return Bun.file(url).text();
}

function lastLine(output: string): string {
  const lines = output.trim().split("\n").filter(Boolean);
  return lines.at(-1) ?? "no output";
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}
