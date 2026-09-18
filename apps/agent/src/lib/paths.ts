/** Host paths agent-install.sh creates and bind-mounts into the agent and
 * nginx containers — see docs/PHASE1_DESIGN.md section 5.2. */
export const NGINX_CONF_DIR = "/var/lib/argo/nginx/conf.d";
export const CERT_DIR = "/var/lib/argo/certs";
