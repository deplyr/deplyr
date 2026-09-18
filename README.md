# Argo

Open-source, self-hostable platform that takes a project from "code on
GitHub" to "live on the internet with a database, SSL, monitoring, and
alerts" — without requiring the user to know what nginx, SSH, or an env
var is.

This repo is in **Phase 1**: one stack (Next.js/Node), one server topology
(a single managed VPS per project, no multi-server orchestration yet), a
free `*.argo.app`-style subdomain, and one hardcoded Slack alert rule. See
[`docs/PHASE1_DESIGN.md`](./docs/PHASE1_DESIGN.md) for the full design
(monorepo layout, schema, agent auth) and the sequential PR plan.

## Two different servers — don't mix these up

- **The control plane** is Argo itself: the web UI, API, and worker in this
  repo. You run this once, on your own box (an EC2 instance, any VPS —
  see "Self-hosting the control plane" below).
- **A managed server** is a VPS a user registers *through* Argo to deploy
  their own app to. Argo SSHes into it once to install a lightweight agent,
  then never needs SSH again.

## Local development

Requires [Bun](https://bun.sh) 1.1+ and Docker (for local Postgres/Redis).

```bash
bun install
bun run infra:up          # starts Postgres + Redis in Docker
bun run db:migrate         # applies the schema in packages/db

bun run dev:web            # http://localhost:3000 — control plane UI
bun run dev:api            # http://localhost:4000 — control plane API
bun run dev:worker         # BullMQ workers (deploy pipeline, health checks, ...)
```

`bun run dev:agent` runs the agent daemon itself — you generally don't run
this locally; it's what gets installed on a managed VPS. It will log a
warning and skip connecting anywhere until `ARGO_CONTROL_PLANE_WS`,
`ARGO_SERVER_ID`, and `ARGO_TOKEN` are set.

Typecheck everything:

```bash
bun run typecheck
```

## Self-hosting the control plane (e.g. on an EC2 instance)

1. Provision a small VPS (an EC2 instance works fine — a `t3.small` or
   larger, Ubuntu 22.04+) and install Docker + the Docker Compose plugin
   on it.
2. Copy this repo onto the box (or clone it) and create a `.env` file at
   the repo root with:
   ```
   POSTGRES_PASSWORD=<choose a strong password>
   ARGO_MASTER_KEY=<32 random bytes, base64 — e.g. `openssl rand -base64 32`>
   ARGO_PUBLIC_URL=http://<the box's public IP>
   ```
3. Bring up the stack:
   ```bash
   docker compose -f infra/docker/docker-compose.prod.yml --env-file .env up -d --build
   ```
4. Open `http://<the box's public IP>` — that's the Argo dashboard. Make
   sure the box's security group / firewall allows inbound traffic on port
   80 (that's the only inbound port the control plane needs).

This stands up the control plane itself. Registering a *managed* server
(the VPS your app actually runs on) happens afterward, from inside the UI —
no SSH required on your end at that point either; Argo does it for you
(see `docs/PHASE1_DESIGN.md` section 3).

## Repo layout

```
apps/
  web/      Next.js control-plane UI
  api/      Hono control-plane API + agent WebSocket endpoint
  worker/   BullMQ job processors (deploy pipeline, provisioning, alerts)
  agent/    Bun + Hono daemon installed on managed VPS instances
packages/
  db/             Drizzle schema, migrations, client
  shared-types/    Zod schemas shared by every app (agent protocol, DTOs)
  queue/            BullMQ queue/job definitions shared by api + worker
  config/            shared tsconfig
infra/
  agent-install.sh   bootstrap script run over SSH during server registration
  docker/             Dockerfiles + compose files (dev and self-hosted prod)
docs/
  PHASE1_DESIGN.md   architecture, schema, agent auth design, PR plan
```
