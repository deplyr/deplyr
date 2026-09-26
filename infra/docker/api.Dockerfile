# Build context is the monorepo root: docker build -f infra/docker/api.Dockerfile .
FROM oven/bun:1-slim AS runner
WORKDIR /app

COPY package.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/queue/package.json packages/queue/package.json
RUN bun install --production

COPY apps/api apps/api
COPY packages/config packages/config
COPY packages/shared-types packages/shared-types
COPY packages/db packages/db
COPY packages/queue packages/queue

ENV NODE_ENV=production
EXPOSE 4000
# Migrations are idempotent (drizzle tracks what's already applied), so
# running them on every start is safe — and it's the only place a fresh
# self-hosted Postgres ever gets its schema; neither this image nor the
# README's compose walkthrough ran them any other way before this.
CMD ["sh", "-c", "bun run --cwd packages/db migrate && bun run --cwd apps/api start"]
