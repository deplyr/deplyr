import { writeFile } from "node:fs/promises";
import type { DeployNginxCommandPayload } from "@deplyr/shared-types";
import { runProcess } from "../lib/run-process";
import { NGINX_CONF_DIR } from "../lib/paths";

export async function nginx(
  payload: Record<string, unknown>,
  emitLog: (line: string) => void,
): Promise<void> {
  const { slug, domain, port } = payload as unknown as DeployNginxCommandPayload;
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
