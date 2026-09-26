# Build context is the monorepo root: docker build -f infra/docker/web.Dockerfile .
FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS deps
COPY package.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/agent/package.json apps/agent/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/queue/package.json packages/queue/package.json
RUN bun install

FROM deps AS build
COPY . .
# Next.js inlines NEXT_PUBLIC_* into the client bundle at *build* time —
# setting them as container `environment:` in docker-compose does nothing,
# the bundle's already got whatever (or nothing) was present right here.
# Must come in as build args, from docker-compose's `build.args:`.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_DOMAIN
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_APP_DOMAIN=$NEXT_PUBLIC_APP_DOMAIN
# Not "bun --cwd apps/web run build": with this image's bun, --cwd before
# the subcommand fails to parse "build" as the script name at all and just
# prints bun's own --help, which exits 0 — silently building nothing, and
# poisoning Docker's cache as if it had succeeded (see the runner stage's
# COPY failures downstream if this regresses).
RUN bun run --cwd apps/web build
# apps/web has no public/ dir (no static assets checked in) — the runner
# stage's COPY below needs it to exist regardless, or it fails outright.
RUN mkdir -p apps/web/public

FROM oven/bun:1-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["bun", "apps/web/server.js"]
