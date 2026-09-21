/** Where Deplyr keeps its files on the managed server. agent-install.sh
 * creates this tree and bind-mounts it into the agent and nginx containers
 * (see docs/PHASE1_DESIGN.md section 5.2). Overridable so the agent can be
 * run — and its deploy commands exercised — on a machine that isn't a
 * dedicated Linux box (a dev laptop, CI) without touching /var/lib. */
export const DEPLYR_HOME = process.env.DEPLYR_HOME ?? "/var/lib/deplyr";

export const NGINX_CONF_DIR = `${DEPLYR_HOME}/nginx/conf.d`;
export const CERT_DIR = `${DEPLYR_HOME}/certs`;
