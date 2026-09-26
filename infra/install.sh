#!/usr/bin/env bash
set -euo pipefail

# One-line self-host installer for the Deplyr control plane — the "one curl
# command" a fresh VPS runs to get Postgres, Redis, the API, the worker, the
# dashboard and Caddy up, with nothing installed by hand first. Not to be
# confused with infra/agent-install.sh, which the control plane itself runs
# over SSH on a *managed* server — this one is for the control plane box.
#
#   curl -fsSL https://raw.githubusercontent.com/deplyr/deplyr/main/infra/install.sh | bash
#
# Safe to re-run: an existing install is updated in place (git pull, rebuild,
# restart) rather than reset — the existing .env is left untouched, so
# DEPLYR_MASTER_KEY never changes under data it's already encrypted. That's
# also how you pick up new Deplyr releases later — just run the same command
# again.
#
# Every value below can be set ahead of time by exporting the same-named
# variable, e.g. a real domain instead of the box's bare IP:
#
#   DEPLYR_PUBLIC_HOST=deplyr.example.com curl -fsSL .../install.sh | bash

REPO_URL="${DEPLYR_REPO_URL:-https://github.com/deplyr/deplyr.git}"
INSTALL_DIR="${DEPLYR_INSTALL_DIR:-/opt/deplyr}"

# ANSI colors — 256-color orange to match the app's accent; falls back
# gracefully (just prints the escape codes literally) on anything that
# doesn't understand them, which is rare enough not to special-case.
ORANGE='\033[38;5;208m'
GREEN='\033[0;32m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${ORANGE}${BOLD}"
echo "██████╗ ███████╗██████╗ ██╗    ██╗   ██╗██████╗ "
echo "██╔══██╗██╔════╝██╔══██╗██║    ╚██╗ ██╔╝██╔══██╗"
echo "██║  ██║█████╗  ██████╔╝██║     ╚████╔╝ ██████╔╝"
echo "██║  ██║██╔══╝  ██╔═══╝ ██║      ╚██╔╝  ██╔══██╗"
echo "██████╔╝███████╗██║     ███████╗  ██║   ██║  ██║"
echo "╚═════╝ ╚══════╝╚═╝     ╚══════╝  ╚═╝   ╚═╝  ╚═╝"
echo -e "${NC}${ORANGE}  From GitHub repo to live on your own server.${NC}\n"

if [ "$(id -u)" -ne 0 ]; then
  echo -e "${RED}Run this as root (or with sudo) — it installs system packages.${NC}" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Docker
# ---------------------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  # Docker's own convenience script (get.docker.com) refuses to run on
  # Amazon Linux ("ERROR: Unsupported distribution 'amzn'") — AL2023 ships
  # Docker in its own dnf repo instead, under the same package name.
  . /etc/os-release 2>/dev/null || true
  if [ "${ID:-}" = "amzn" ]; then
    echo -e "${ORANGE}Installing Docker (Amazon Linux)...${NC}"
    if command -v dnf >/dev/null 2>&1; then dnf install -y docker; else yum install -y docker; fi
  else
    echo -e "${ORANGE}Installing Docker...${NC}"
    curl -fsSL https://get.docker.com | sh
  fi
fi
systemctl enable --now docker >/dev/null 2>&1 || true

if ! docker compose version >/dev/null 2>&1; then
  echo -e "${RED}Docker installed, but its Compose plugin didn't come with it.${NC}" >&2
  echo "See https://docs.docker.com/compose/install/ and re-run this." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# git, openssl — both ubiquitous, but not guaranteed on a bare cloud image
# ---------------------------------------------------------------------------
for bin in git openssl; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo -e "${ORANGE}Installing $bin...${NC}"
    if command -v apt-get >/dev/null 2>&1; then apt-get update -y && apt-get install -y "$bin"
    elif command -v dnf >/dev/null 2>&1; then dnf install -y "$bin"
    elif command -v yum >/dev/null 2>&1; then yum install -y "$bin"
    else
      echo -e "${RED}Couldn't find a package manager to install $bin — install it yourself and re-run.${NC}" >&2
      exit 1
    fi
  fi
done

# ---------------------------------------------------------------------------
# fetch (or update) the repo
# ---------------------------------------------------------------------------
if [ -d "$INSTALL_DIR/.git" ]; then
  echo -e "${ORANGE}Updating existing install at $INSTALL_DIR...${NC}"
  git -C "$INSTALL_DIR" pull --ff-only
else
  echo -e "${ORANGE}Cloning Deplyr into $INSTALL_DIR...${NC}"
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"

# ---------------------------------------------------------------------------
# .env — generated once, on first install; left alone on every re-run
# ---------------------------------------------------------------------------
ENV_FILE="$INSTALL_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo -e "${ORANGE}First install — generating $ENV_FILE with fresh secrets...${NC}"

  PUBLIC_HOST="${DEPLYR_PUBLIC_HOST:-}"
  if [ -z "$PUBLIC_HOST" ]; then
    PUBLIC_HOST=$(curl -fsSL -4 https://ifconfig.me 2>/dev/null || curl -fsSL -4 https://api.ipify.org 2>/dev/null || true)
  fi
  if [ -z "$PUBLIC_HOST" ]; then
    echo -e "${RED}Couldn't auto-detect this box's public IP. Re-run with DEPLYR_PUBLIC_HOST=<ip-or-domain> set.${NC}" >&2
    exit 1
  fi
  # A domain gets automatic HTTPS from Caddy; a bare IP can't get a real
  # certificate, so DEPLYR_PUBLIC_URL stays http:// for that case (see the
  # compose file's own notes) — DEPLYR_PUBLIC_HOST wins either way for
  # DEPLYR_PUBLIC_URL's scheme if it looks like a domain, not an IP.
  WEB_PORT="${DEPLYR_WEB_PORT:-80}"
  case "$PUBLIC_HOST" in
    *[a-zA-Z]*) DEFAULT_URL="https://$PUBLIC_HOST"; SITE_ADDRESS="$PUBLIC_HOST" ;;
    # http:// explicitly: Caddy otherwise self-signs an IP and redirects to it.
    *) DEFAULT_URL="http://$PUBLIC_HOST"; SITE_ADDRESS="http://$PUBLIC_HOST" ;;
  esac

  cat > "$ENV_FILE" <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 24)
DEPLYR_MASTER_KEY=$(openssl rand -base64 32)
DEPLYR_SESSION_SECRET=$(openssl rand -base64 32)
DEPLYR_PUBLIC_URL=${DEPLYR_PUBLIC_URL:-$DEFAULT_URL}
DEPLYR_PUBLIC_HOST=$PUBLIC_HOST
DEPLYR_SITE_ADDRESS=$SITE_ADDRESS
DEPLYR_APP_DOMAIN=${DEPLYR_APP_DOMAIN:-}
DEPLYR_WEB_PORT=$WEB_PORT
DEPLYR_LOCAL_SERVER_ID=$(cat /proc/sys/kernel/random/uuid)
DEPLYR_LOCAL_AGENT_TOKEN=$(openssl rand -hex 32)
DEPLYR_CLOUD_MODE=${DEPLYR_CLOUD_MODE:-}
GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID:-}
GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET:-}
EOF
  chmod 600 "$ENV_FILE"
  echo -e "${GREEN}Wrote $ENV_FILE${NC} — back up DEPLYR_MASTER_KEY somewhere safe, it can't be recovered if it's lost."
else
  echo -e "${ORANGE}Found existing $ENV_FILE${NC} — reusing it as-is (secrets untouched)."
  if ! grep -q '^DEPLYR_LOCAL_SERVER_ID=' "$ENV_FILE"; then
    {
      echo "DEPLYR_LOCAL_SERVER_ID=$(cat /proc/sys/kernel/random/uuid)"
      echo "DEPLYR_LOCAL_AGENT_TOKEN=$(openssl rand -hex 32)"
    } >> "$ENV_FILE"
  fi
  # An .env from before DEPLYR_SITE_ADDRESS existed: add it, otherwise a
  # bare-IP install keeps Caddy's IP auto-HTTPS redirect (see the compose file).
  if ! grep -q '^DEPLYR_SITE_ADDRESS=' "$ENV_FILE"; then
    HOST=$(grep '^DEPLYR_PUBLIC_HOST=' "$ENV_FILE" | cut -d= -f2-)
    case "$HOST" in
      *[a-zA-Z]*) echo "DEPLYR_SITE_ADDRESS=$HOST" >> "$ENV_FILE" ;;
      *) echo "DEPLYR_SITE_ADDRESS=http://$HOST" >> "$ENV_FILE" ;;
    esac
  fi
fi

# ---------------------------------------------------------------------------
# bring it up
# ---------------------------------------------------------------------------
echo -e "${ORANGE}Building and starting Deplyr (this takes a few minutes the first time)...${NC}"
docker compose -f infra/docker/docker-compose.prod.yml --env-file "$ENV_FILE" up -d --build

# ---------------------------------------------------------------------------
# this box as your first managed server
# ---------------------------------------------------------------------------
# The api registers "This server" itself once you've created your account (no
# SSH — see apps/api/src/lib/local-server.ts); all that's left is starting the
# agent here with the token it expects. It retries until the record exists.
get() { grep "^$1=" "$ENV_FILE" | cut -d= -f2-; }
WEB_PORT=$(get DEPLYR_WEB_PORT); WEB_PORT=${WEB_PORT:-80}
echo -e "${ORANGE}Starting this box's agent...${NC}"
# Caddy is the one front door here (dashboard and every app, by hostname), so
# the agent skips its nginx. It reaches the api via Caddy's published port on
# loopback: no public IP, nothing for a firewall to block.
DEPLYR_TOKEN="$(get DEPLYR_LOCAL_AGENT_TOKEN)" \
DEPLYR_SERVER_ID="$(get DEPLYR_LOCAL_SERVER_ID)" \
DEPLYR_CONTROL_PLANE_WS="ws://127.0.0.1:$WEB_PORT/api/agent/ws" \
DEPLYR_SKIP_NGINX=1 \
  bash "$INSTALL_DIR/infra/agent-install.sh"

PUBLIC_URL=$(grep '^DEPLYR_PUBLIC_URL=' "$ENV_FILE" | cut -d= -f2-)
echo ""
echo -e "${GREEN}${BOLD}Deplyr is up:${NC} ${ORANGE}$PUBLIC_URL${NC}"
echo "Open it — first visit walks you through creating the admin account, and this box is"
echo "registered as your first server automatically, so you can deploy right away."
echo "Only ports 80 and 443 need to be open in your firewall / security group — the dashboard and every app you deploy here use them."
echo "To update later, run this exact command again."
