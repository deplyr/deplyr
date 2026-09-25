import { rm, writeFile } from "node:fs/promises";
import type { DeployNginxCommandPayload } from "@deplyr/shared-types";
import { runProcess } from "../lib/run-process";
import { NGINX_CONF_DIR } from "../lib/paths";

// Fixed filename, not per-slug: nginx refuses to reload with two
// `default_server` blocks on the same listen socket, so only one project
// can ever hold this spot. Whichever project without a domain deploys
// most recently claims bare-IP access; the file's own name says so.
const DEFAULT_SERVER_CONF = `${NGINX_CONF_DIR}/_no_domain_configured.conf`;

export async function nginx(
  payload: Record<string, unknown>,
  emitLog: (line: string) => void,
): Promise<void> {
  const { slug, domain, port } = payload as unknown as DeployNginxCommandPayload;

  if (!domain) {
    // No domain configured (self-host default) — serve this project on
    // the box's bare IP instead of a hostname nobody owns. See
    // apps/web/lib/app-domain.ts for the matching UI fallback.
    const conf = `server {
    listen 80 default_server;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
`;
    await writeFile(DEFAULT_SERVER_CONF, conf, "utf8");
    // This project may have had a real domain before — drop that stale
    // per-slug config so it doesn't linger as a dead, non-matching vhost.
    await rm(`${NGINX_CONF_DIR}/${slug}.conf`, { force: true });
    emitLog(`wrote nginx config for ${slug} — no domain configured, serving it on the box's bare IP`);
    await runProcess(["docker", "exec", "deplyr-nginx", "nginx", "-s", "reload"], emitLog);
    return;
  }

  const serverName = `${slug}.${domain}`;

  const conf = `server {
    listen 80;
    server_name ${serverName};

    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
`;

  await writeFile(`${NGINX_CONF_DIR}/${slug}.conf`, conf, "utf8");
  emitLog(`wrote nginx config for ${serverName}`);

  await runProcess(["docker", "exec", "deplyr-nginx", "nginx", "-s", "reload"], emitLog);
}
