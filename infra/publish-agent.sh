#!/usr/bin/env bash
set -euo pipefail

# Builds infra/docker/agent.Dockerfile and pushes it to GHCR — run this by
# hand whenever the agent is ready to ship (not on every push to main; the
# agent only needs republishing when apps/agent, packages/shared-types, or
# packages/config actually change).
#
# Multi-arch on purpose: this usually runs on an Apple Silicon Mac, but a
# managed server can be either amd64 (most EC2 types) or arm64 (Graviton) —
# `docker buildx build --platform ...` builds and pushes both under one tag,
# so `docker pull` on either architecture gets the right image automatically.
#
# Usage:
#   infra/publish-agent.sh              # build + push :latest and :<git-sha>
#   infra/publish-agent.sh v0.2.0        # also tag :v0.2.0
#   infra/publish-agent.sh --no-push     # build locally only, don't push
#   IMAGE=ghcr.io/you/agent infra/publish-agent.sh   # override the image name

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

IMAGE="${IMAGE:-ghcr.io/deplyr/agent}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"
DOCKERFILE="infra/docker/agent.Dockerfile"

PUSH=1
EXTRA_TAG=""
for arg in "$@"; do
  case "$arg" in
    --no-push) PUSH=0 ;;
    -*) echo "Unknown flag: $arg" >&2; exit 1 ;;
    *) EXTRA_TAG="$arg" ;;
  esac
done

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required." >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Warning: you have uncommitted changes — the image will contain them," >&2
  echo "but the :\$(git rev-parse --short HEAD) tag won't reflect what's actually in it." >&2
fi

SHA="$(git rev-parse --short HEAD)"
TAG_ARGS=(-t "$IMAGE:latest" -t "$IMAGE:$SHA")
if [ -n "$EXTRA_TAG" ]; then
  TAG_ARGS+=(-t "$IMAGE:$EXTRA_TAG")
fi

echo "Building $IMAGE for $PLATFORMS from $DOCKERFILE ..."
echo "Tags: latest, $SHA${EXTRA_TAG:+, $EXTRA_TAG}"

BUILD_ARGS=(buildx build --platform "$PLATFORMS" -f "$DOCKERFILE" "${TAG_ARGS[@]}")
if [ "$PUSH" = 1 ]; then
  BUILD_ARGS+=(--push)
else
  # A multi-platform build can't be loaded into the local docker daemon
  # (there's no single-arch image to load) — build-only mode targets just
  # this machine's architecture instead, so you can test it locally first.
  BUILD_ARGS=(buildx build --load -f "$DOCKERFILE" "${TAG_ARGS[@]}")
  echo "(--no-push: building for this machine's architecture only, loaded into local docker)"
fi
BUILD_ARGS+=(.)

if [ "$PUSH" = 1 ]; then
  echo
  echo "Pushing requires being logged in to ghcr.io with a token that has"
  echo "'write:packages' scope: docker login ghcr.io -u <your-github-username>"
  echo "(paste a classic PAT with write:packages when asked for the password)."
  echo
fi

docker "${BUILD_ARGS[@]}"

echo
echo "Done."
if [ "$PUSH" = 1 ]; then
  echo "Pushed: $IMAGE:latest, $IMAGE:$SHA${EXTRA_TAG:+, $IMAGE:$EXTRA_TAG}"
  echo "If ghcr.io/deplyr/agent is private, make it public once: the package's"
  echo "Settings -> Change visibility (GitHub -> deplyr org -> Packages)."
else
  echo "Built locally as: $IMAGE:latest, $IMAGE:$SHA${EXTRA_TAG:+, $IMAGE:$EXTRA_TAG}"
  echo "Try it: docker run --rm $IMAGE:latest bun --version"
fi
