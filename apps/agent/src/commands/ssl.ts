import { writeFile } from "node:fs/promises";
import type { DeploySslCommandPayload } from "@deplyr/shared-types";
import { runProcess } from "../lib/run-process";
import { NGINX_CONF_DIR, CERT_DIR } from "../lib/paths";

/**
 * Writes the operator-supplied wildcard cert (if any — see
 * docs/PHASE1_DESIGN.md section 5.3) and an HTTPS server block. Certs are
 * shared across every project on this box, so writing them is idempotent;
 * only the per-project server block is new each time.
 */
export async function ssl(
  payload: Record<string, unknown>,
  emitLog: (line: string) => void,
): Promise<string> {
  const { slug, domain, port, certPem, keyPem } = payload as unknown as DeploySslCommandPayload;

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
