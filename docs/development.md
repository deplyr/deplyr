# Development

## Requirements

[Bun](https://bun.sh) 1.1+ and Docker (for local Postgres and Redis).

## Run locally

```bash
cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env
cp apps/web/.env.local.example apps/web/.env.local
```

Generate two secrets with `openssl rand -base64 32`. Put them in `apps/api/.env` as
`DEPLYR_MASTER_KEY` and `DEPLYR_SESSION_SECRET`. Use the **same** `DEPLYR_MASTER_KEY`
in `apps/worker/.env`.

```bash
bun install
bun run infra:up      # Postgres + Redis in Docker
bun run db:migrate    # apply the schema

bun run dev:web       # http://localhost:3000
bun run dev:api       # http://localhost:4000
bun run dev:worker    # background jobs
```

Open <http://localhost:3000> and create the first account.

`bun run dev:agent` runs the agent. You normally don't need to: it is what gets
installed on a server. It needs `DEPLYR_CONTROL_PLANE_WS`, `DEPLYR_SERVER_ID` and
`DEPLYR_TOKEN`.

Docker Desktop on a Mac doesn't provide host networking, which deployed apps use.
To try real deploys, use a Linux server or VM as the server.

## Checks

```bash
bun run typecheck     # every package
bun test              # run inside a package (api, db, shared-types)
```

## Repository layout

```
apps/
  web/      Next.js dashboard, landing page and public docs page
  api/      Hono API and the agent WebSocket endpoint
  worker/   BullMQ processors: deploys, databases, domains, health checks, alerts
  agent/    The Bun program installed on servers
packages/
  db/            Drizzle schema, migrations, encryption, audit, notifications, Caddy config
  shared-types/  Zod schemas and logic shared by every app (protocol, build plan)
  queue/         Queue definitions and the agent command bridge
  config/        Shared tsconfig
infra/
  install.sh         The one-command installer
  agent-install.sh   Installs the agent on an extra server
  publish-agent.sh   Builds and publishes the agent image
  docker/            Dockerfiles, Caddyfile, and the compose files
docs/                These pages
```

## Publishing the agent image

The agent image is published by hand when the agent changes:

```bash
docker login ghcr.io          # token with write:packages
infra/publish-agent.sh        # multi-arch (amd64 + arm64) push to ghcr.io/deplyr/agent
infra/publish-agent.sh --no-push   # build locally only
```

## Adding a new agent command

1. Add the payload type in `packages/shared-types`.
2. Add the handler in `apps/agent/src/commands` and register it in `index.ts`.
3. Call it from a worker job with `runAgentCommand`.
4. Republish the agent image.

## The landing page

The same web app serves the marketing pages. With `NEXT_PUBLIC_MARKETING_ONLY=1` it
serves only `/` and `/docs`, which is how the public website is deployed.
