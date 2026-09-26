import { Client } from "ssh2";

export interface SshCredential {
  type: "password" | "private_key";
  value: string;
}

export interface SshExecResult {
  exitCode: number;
  output: string;
}

const CONNECT_TIMEOUT_MS = 20_000;

/**
 * ssh2's key parser is strict about exact PEM/OpenSSH framing: pasting a key
 * from a browser textarea commonly introduces CRLF line endings, a stray
 * leading/trailing blank line, or a missing final newline, any of which
 * makes it throw "Cannot parse privateKey: Unsupported key format" even
 * though the key itself is fine. Normalize before handing it to ssh2.
 */
function normalizePrivateKey(value: string): string {
  return value.replace(/\r\n/g, "\n").trim() + "\n";
}

/**
 * Connects as root and runs `script` via `bash -s` (script piped over
 * stdin). Used by the server:install job to run infra/agent-install.sh on
 * a user's freshly-registered VPS — see docs/architecture.md
 */
export async function sshExec(
  host: string,
  credential: SshCredential,
  script: string,
): Promise<SshExecResult> {
  const conn = new Client();

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      conn.end();
      reject(new Error("SSH connection timed out"));
    }, CONNECT_TIMEOUT_MS);

    conn
      .on("ready", () => {
        clearTimeout(timer);
        resolve();
      })
      .on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      })
      .connect({
        host,
        port: 22,
        username: "root",
        readyTimeout: CONNECT_TIMEOUT_MS,
        ...(credential.type === "password"
          ? { password: credential.value }
          : { privateKey: normalizePrivateKey(credential.value) }),
      });
  });

  try {
    return await new Promise<SshExecResult>((resolve, reject) => {
      conn.exec("bash -s", (err, stream) => {
        if (err) return reject(err);
        let output = "";
        stream.on("data", (chunk: Buffer) => {
          output += chunk.toString();
        });
        stream.stderr.on("data", (chunk: Buffer) => {
          output += chunk.toString();
        });
        stream.on("close", (exitCode: number | null) => {
          resolve({ exitCode: exitCode ?? 1, output });
        });
        stream.end(script);
      });
    });
  } finally {
    conn.end();
  }
}
