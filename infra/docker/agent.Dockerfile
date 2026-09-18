# Built and pushed to ghcr.io/argo-deploy/agent:latest — this is the image
# infra/agent-install.sh pulls onto a user's managed VPS.
# Build context is the monorepo root: docker build -f infra/docker/agent.Dockerfile .
FROM oven/bun:1-slim AS runner
WORKDIR /app

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
