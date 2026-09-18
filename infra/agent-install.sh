#!/usr/bin/env bash
set -euo pipefail

# Piped over the SSH session opened by the server:install job
# (apps/worker/src/jobs/server-install.ts, implemented in PR2). Runs as
# root on the user's VPS. Expects ARGO_TOKEN, ARGO_SERVER_ID, and
# ARGO_CONTROL_PLANE_WS to already be set in the environment it runs in —
# see docs/PHASE1_DESIGN.md section 3 for the full registration flow.
#
# The agent container is never port-published: it only dials out to the
# control plane, so there's nothing here that needs an inbound firewall
# rule on the box.

: "${ARGO_TOKEN:?ARGO_TOKEN must be set}"
: "${ARGO_SERVER_ID:?ARGO_SERVER_ID must be set}"
: "${ARGO_CONTROL_PLANE_WS:?ARGO_CONTROL_PLANE_WS must be set}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
fi

systemctl enable --now docker >/dev/null 2>&1 || true

echo "Starting Argo agent..."
docker rm -f argo-agent >/dev/null 2>&1 || true

docker run -d \
  --name argo-agent \
  --restart unless-stopped \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e ARGO_TOKEN="$ARGO_TOKEN" \
  -e ARGO_SERVER_ID="$ARGO_SERVER_ID" \
  -e ARGO_CONTROL_PLANE_WS="$ARGO_CONTROL_PLANE_WS" \
  ghcr.io/argo-deploy/agent:latest

echo "Argo agent container started."
