/** Where Deplyr keeps its files on the managed server. agent-install.sh
 * creates this tree and bind-mounts it into the agent and nginx containers
 * (see docs/architecture.md). Overridable so the agent can be
 * run — and its deploy commands exercised — on a machine that isn't a
 * dedicated Linux box (a dev laptop, CI) without touching /var/lib. */
export const DEPLYR_HOME = process.env.DEPLYR_HOME ?? "/var/lib/deplyr";

export const NGINX_CONF_DIR = `${DEPLYR_HOME}/nginx/conf.d`;
export const CERT_DIR = `${DEPLYR_HOME}/certs`;
// certbot's own state (account, live certs, renewal config) — kept outside
// DEPLYR_HOME's per-app tree since it's shared across every domain, not
// per-project. Bind-mounted into the nginx container too, read-only, so
// nginx can read the certs certbot writes there.
export const CERTBOT_DIR = `${DEPLYR_HOME}/certbot`;
// Where the ACME HTTP-01 challenge files live. nginx must serve this path
// for a domain *before* a cert exists for it — see domain.ts.
export const ACME_WEBROOT_DIR = `${DEPLYR_HOME}/acme-webroot`;
