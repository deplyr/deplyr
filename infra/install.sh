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
    echo "Installing Docker (Amazon Linux)..."
    if command -v dnf >/dev/null 2>&1; then dnf install -y docker; else yum install -y docker; fi
  else
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
  fi
fi
systemctl enable --now docker >/dev/null 2>&1 || true

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker installed, but its Compose plugin didn't come with it." >&2
  echo "See https://docs.docker.com/compose/install/ and re-run this." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# git, openssl — both ubiquitous, but not guaranteed on a bare cloud image
# ---------------------------------------------------------------------------
for bin in git openssl; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "Installing $bin..."
    if command -v apt-get >/dev/null 2>&1; then apt-get update -y && apt-get install -y "$bin"
    elif command -v dnf >/dev/null 2>&1; then dnf install -y "$bin"
    elif command -v yum >/dev/null 2>&1; then yum install -y "$bin"
    else
      echo "Couldn't find a package manager to install $bin — install it yourself and re-run." >&2
      exit 1
    fi
  fi
done

# ---------------------------------------------------------------------------
# fetch (or update) the repo
# ---------------------------------------------------------------------------
if [ -d "$INSTALL_DIR/.git" ]; then
  echo "Updating existing install at $INSTALL_DIR..."
  git -C "$INSTALL_DIR" pull --ff-only
else
  echo "Cloning Deplyr into $INSTALL_DIR..."
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"

# ---------------------------------------------------------------------------
# .env — generated once, on first install; left alone on every re-run
# ---------------------------------------------------------------------------
ENV_FILE="$INSTALL_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "First install — generating $ENV_FILE with fresh secrets..."

  PUBLIC_HOST="${DEPLYR_PUBLIC_HOST:-}"
  if [ -z "$PUBLIC_HOST" ]; then
    PUBLIC_HOST=$(curl -fsSL -4 https://ifconfig.me 2>/dev/null || curl -fsSL -4 https://api.ipify.org 2>/dev/null || true)
  fi
  if [ -z "$PUBLIC_HOST" ]; then
    echo "Couldn't auto-detect this box's public IP. Re-run with DEPLYR_PUBLIC_HOST=<ip-or-domain> set." >&2
    exit 1
  fi
  # A domain gets automatic HTTPS from Caddy; a bare IP can't get a real
  # certificate, so DEPLYR_PUBLIC_URL stays http:// for that case (see the
  # compose file's own notes) — DEPLYR_PUBLIC_HOST wins either way for
  # DEPLYR_PUBLIC_URL's scheme if it looks like a domain, not an IP.
  case "$PUBLIC_HOST" in
    *[a-zA-Z]*) DEFAULT_SCHEME="https" ;;
    *) DEFAULT_SCHEME="http" ;;
  esac

  cat > "$ENV_FILE" <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 24)
DEPLYR_MASTER_KEY=$(openssl rand -base64 32)
DEPLYR_SESSION_SECRET=$(openssl rand -base64 32)
DEPLYR_PUBLIC_URL=${DEPLYR_PUBLIC_URL:-$DEFAULT_SCHEME://$PUBLIC_HOST}
DEPLYR_PUBLIC_HOST=$PUBLIC_HOST
DEPLYR_APP_DOMAIN=${DEPLYR_APP_DOMAIN:-}
DEPLYR_WEB_PORT=${DEPLYR_WEB_PORT:-80}
DEPLYR_CLOUD_MODE=${DEPLYR_CLOUD_MODE:-}
GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID:-}
GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET:-}
EOF
  chmod 600 "$ENV_FILE"
  echo "Wrote $ENV_FILE — back up DEPLYR_MASTER_KEY somewhere safe, it can't be recovered if it's lost."
else
  echo "Found existing $ENV_FILE — reusing it as-is (secrets untouched)."
fi

# ---------------------------------------------------------------------------
# bring it up
# ---------------------------------------------------------------------------
echo "Building and starting Deplyr (this takes a few minutes the first time)..."
docker compose -f infra/docker/docker-compose.prod.yml --env-file "$ENV_FILE" up -d --build

PUBLIC_URL=$(grep '^DEPLYR_PUBLIC_URL=' "$ENV_FILE" | cut -d= -f2-)
echo ""
echo "Deplyr is up: $PUBLIC_URL"
echo "Open it — first visit walks you through creating the admin account."
echo "To update later, or add a managed server, run this exact command again."
