# Build context is the monorepo root: docker build -f infra/docker/worker.Dockerfile .
FROM oven/bun:1-slim AS runner
WORKDIR /app

COPY package.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/queue/package.json packages/queue/package.json
RUN bun install --production

COPY apps/worker apps/worker
COPY packages/config packages/config
COPY packages/shared-types packages/shared-types
COPY packages/db packages/db
COPY packages/queue packages/queue

ENV NODE_ENV=production
CMD ["bun", "run", "--cwd", "apps/worker", "start"]
