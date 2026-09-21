#!/usr/bin/env bash
set -euo pipefail

# Piped over the SSH session opened by the server:install job
# (apps/worker/src/jobs/server-install.ts, PR2). Runs as root on the
# user's VPS. Expects DEPLYR_TOKEN, DEPLYR_SERVER_ID, and DEPLYR_CONTROL_PLANE_WS
# to already be set in the environment it runs in — see
# docs/PHASE1_DESIGN.md section 3 for the full registration flow, and
# section 5 for why this script also stands up a sibling nginx container.
#
# Neither the agent nor nginx container is reachable via inbound-initiated
# connections to the control plane — the agent only dials out, and nginx
# is the one thing here that *does* need inbound 80/443, which is the
# whole point of it.

: "${DEPLYR_TOKEN:?DEPLYR_TOKEN must be set}"
: "${DEPLYR_SERVER_ID:?DEPLYR_SERVER_ID must be set}"
: "${DEPLYR_CONTROL_PLANE_WS:?DEPLYR_CONTROL_PLANE_WS must be set}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
fi

systemctl enable --now docker >/dev/null 2>&1 || true

# One parent directory, bind-mounted at the same path into the agent
# container. Paths the agent writes to (cloned source, nginx config, certs)
# have to match exactly what it later passes to `docker run -v ...` for
# app/nginx containers — those `-v` flags are resolved by the Docker
# daemon against the *host* filesystem even when issued from inside the
# agent's own container (via the mounted socket), so "same path on both
# sides" is what makes that work, not a coincidence.
DEPLYR_HOME=/var/lib/deplyr
mkdir -p "$DEPLYR_HOME/apps" "$DEPLYR_HOME/nginx/conf.d" "$DEPLYR_HOME/certs"

if [ ! -f "$DEPLYR_HOME/nginx/nginx.conf" ]; then
  cat > "$DEPLYR_HOME/nginx/nginx.conf" <<'EOF'
events {}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    include /etc/nginx/conf.d/*.conf;
}
EOF
fi

echo "Starting Deplyr agent..."
docker rm -f deplyr-agent >/dev/null 2>&1 || true

# --network host: the deploy health check probes http://127.0.0.1:<port>, and
# apps run on the host network — from the default bridge network that address
# would be the agent container itself, never the app.
docker run -d \
  --name deplyr-agent \
  --restart unless-stopped \
  --network host \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$DEPLYR_HOME:$DEPLYR_HOME" \
  -e DEPLYR_TOKEN="$DEPLYR_TOKEN" \
  -e DEPLYR_SERVER_ID="$DEPLYR_SERVER_ID" \
  -e DEPLYR_CONTROL_PLANE_WS="$DEPLYR_CONTROL_PLANE_WS" \
  ghcr.io/deplyr/agent:latest

echo "Starting nginx..."
docker rm -f deplyr-nginx >/dev/null 2>&1 || true

docker run -d \
  --name deplyr-nginx \
  --restart unless-stopped \
  --network host \
  -v "$DEPLYR_HOME/nginx/nginx.conf:/etc/nginx/nginx.conf:ro" \
  -v "$DEPLYR_HOME/nginx/conf.d:/etc/nginx/conf.d" \
  -v "$DEPLYR_HOME/certs:$DEPLYR_HOME/certs:ro" \
  nginx:alpine

echo "Deplyr agent and nginx containers started."
