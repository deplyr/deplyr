# Built and pushed to ghcr.io/deplyr/agent:latest — this is the image
# infra/agent-install.sh pulls onto a user's managed VPS.
# Build context is the monorepo root: docker build -f infra/docker/agent.Dockerfile .
FROM oven/bun:1-slim AS runner
WORKDIR /app

# git: for deploy.clone. docker-cli: the `docker` binary the agent shells
# out to for every deploy/database/domain step, talking to the daemon over
# the mounted socket (docker.sock) — every such step runs as a sibling
# container. See docs/PHASE1_DESIGN.md section 5.1.
#
# docker-cli, not docker.io: on Debian 13 (trixie), docker.io only pulls in
# dockerd (the daemon) — the client binary was split into its own package.
# We never run a daemon in this container (the host's is used, via the
# mounted socket), so docker-cli is both correct and smaller.
RUN apt-get update && \
    apt-get install -y --no-install-recommends git docker-cli && \
    rm -rf /var/lib/apt/lists/*

COPY package.json ./
COPY apps/agent/package.json apps/agent/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN bun install --production

COPY apps/agent apps/agent
COPY packages/config packages/config
COPY packages/shared-types packages/shared-types

ENV NODE_ENV=production
CMD ["bun", "run", "--cwd", "apps/agent", "start"]
