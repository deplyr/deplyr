import { writeFile } from "node:fs/promises";
import type { DeploySslCommandPayload } from "@deplyr/shared-types";
import { runProcess } from "../lib/run-process";
import { NGINX_CONF_DIR, CERT_DIR } from "../lib/paths";

/**
 * Writes the operator-supplied wildcard cert (if any — see
 * docs/architecture.md) and an HTTPS server block. Certs are
 * shared across every project on this box, so writing them is idempotent;
 * only the per-project server block is new each time.
 */
export async function ssl(
  payload: Record<string, unknown>,
  emitLog: (line: string) => void,
): Promise<string> {
  const { slug, domain, port, certPem, keyPem } = payload as unknown as DeploySslCommandPayload;

  // A cert is for a hostname — nothing to issue or attach one to on the
  // self-host bare-IP fallback (see nginx.ts).
  if (!domain) {
    emitLog("no domain configured — staying on HTTP (see nginx.ts's bare-IP fallback)");
    return "http_only";
  }

  if (!certPem || !keyPem) {
    emitLog(
      "no wildcard certificate configured on the control plane — app is reachable over HTTP only",
    );
    return "http_only";
  }

  await writeFile(`${CERT_DIR}/wildcard.crt`, certPem, "utf8");
  await writeFile(`${CERT_DIR}/wildcard.key`, keyPem, "utf8");

  const serverName = `${slug}.${domain}`;
  const conf = `server {
    listen 443 ssl;
    server_name ${serverName};

    ssl_certificate ${CERT_DIR}/wildcard.crt;
    ssl_certificate_key ${CERT_DIR}/wildcard.key;

    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
`;

  await writeFile(`${NGINX_CONF_DIR}/${slug}-ssl.conf`, conf, "utf8");
  emitLog(`wrote HTTPS config for ${serverName}`);

  await runProcess(["docker", "exec", "deplyr-nginx", "nginx", "-s", "reload"], emitLog);
  return "https";
}
