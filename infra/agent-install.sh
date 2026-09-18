#!/usr/bin/env bash
set -euo pipefail

# Piped over the SSH session opened by the server:install job
# (apps/worker/src/jobs/server-install.ts, PR2). Runs as root on the
# user's VPS. Expects ARGO_TOKEN, ARGO_SERVER_ID, and ARGO_CONTROL_PLANE_WS
# to already be set in the environment it runs in — see
# docs/PHASE1_DESIGN.md section 3 for the full registration flow, and
# section 5 for why this script also stands up a sibling nginx container.
#
# Neither the agent nor nginx container is reachable via inbound-initiated
# connections to the control plane — the agent only dials out, and nginx
# is the one thing here that *does* need inbound 80/443, which is the
# whole point of it.

: "${ARGO_TOKEN:?ARGO_TOKEN must be set}"
: "${ARGO_SERVER_ID:?ARGO_SERVER_ID must be set}"
: "${ARGO_CONTROL_PLANE_WS:?ARGO_CONTROL_PLANE_WS must be set}"

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
ARGO_HOME=/var/lib/argo
mkdir -p "$ARGO_HOME/apps" "$ARGO_HOME/nginx/conf.d" "$ARGO_HOME/certs"

if [ ! -f "$ARGO_HOME/nginx/nginx.conf" ]; then
  cat > "$ARGO_HOME/nginx/nginx.conf" <<'EOF'
events {}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    include /etc/nginx/conf.d/*.conf;
}
EOF
fi

echo "Starting Argo agent..."
docker rm -f argo-agent >/dev/null 2>&1 || true

docker run -d \
  --name argo-agent \
  --restart unless-stopped \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$ARGO_HOME:$ARGO_HOME" \
  -e ARGO_TOKEN="$ARGO_TOKEN" \
  -e ARGO_SERVER_ID="$ARGO_SERVER_ID" \
  -e ARGO_CONTROL_PLANE_WS="$ARGO_CONTROL_PLANE_WS" \
  ghcr.io/argo-deploy/agent:latest

echo "Starting nginx..."
docker rm -f argo-nginx >/dev/null 2>&1 || true

docker run -d \
  --name argo-nginx \
  --restart unless-stopped \
  --network host \
  -v "$ARGO_HOME/nginx/nginx.conf:/etc/nginx/nginx.conf:ro" \
  -v "$ARGO_HOME/nginx/conf.d:/etc/nginx/conf.d" \
  -v "$ARGO_HOME/certs:$ARGO_HOME/certs:ro" \
  nginx:alpine

echo "Argo agent and nginx containers started."
