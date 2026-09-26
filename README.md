# Deplyr

Open-source, self-hostable platform that takes a project from "code on
GitHub" to "live on your own server with a database, logs, monitoring and
alerts" — without needing to know what nginx, SSH or an env var is.

You point Deplyr at a VPS you own (an EC2 instance, a Hetzner box, anything
running Linux). It installs what it needs over SSH once, then you deploy apps
from GitHub, spin up Postgres or Redis, watch health and logs, and get told in
Discord or Slack when something breaks.

> **Status: early alpha.** The control plane and the deploy pipeline are built
> and tested piece by piece, but the full flow on a real remote Linux server is
> still being validated. See [Status and known limitations](#status-and-known-limitations)
> before relying on it.

## What it does

**Servers**
- Register any Linux VPS with an IP and root password or SSH key; Deplyr installs
  Docker, nginx and a small agent for you.
- Live CPU, memory, disk and load, with history charts (1h to 7d) and a
  stale-agent warning.

**Deployments**
- Deploy from GitHub: **Next.js, NestJS, plain Node**, or anything with a
  **Dockerfile**.
- Detects the package manager (npm, pnpm, yarn, bun), the Node version, and
  monorepo subfolders. Everything it detects is editable per project (install,
  build and start commands, root folder, health-check path).
- Secrets are encrypted at rest, available to both the build and the running
  app, and never written into your source tree or a Docker image layer.
- Step-by-step deploy progress with per-step logs.

**Domains**
- Every project gets a free `<name>.<your-domain>` address.
- Add your own domain: Deplyr shows the DNS record to create, verifies it
  automatically, and issues a real Let's Encrypt certificate for it — no
  wildcard certificate needed for custom domains, and certificates renew
  themselves.

**Databases**
- Create **PostgreSQL** and **Redis** on a server: choose version, port, memory
  limit and (for Redis) eviction policy and persistence.
- Private by default: bound to the server's loopback, reachable only by apps on
  that server. Credentials are revealed on demand.
- Health, stats and history charts (Redis hit rate and memory, Postgres
  connections and cache ratio), plus container logs.

**Visibility**
- **Activity log** of every action on a server: deploys, database changes,
  installs, agent connects, secret changes, alerts.
- **Notifications** to **Discord** and **Slack** for apps going down, deploys
  finishing, servers going offline and databases failing, with a full delivery
  history (including failures and why).
- Live container logs for apps and databases.

## How it works

Two different servers are involved — don't mix them up:

- **The control plane** is Deplyr itself: the web UI, the API and a background
  worker in this repo. You run it once, on your own box.
- **A managed server** is a VPS you register *through* Deplyr to run your apps
  on. Deplyr SSHes in once to install an agent and never needs SSH again: the
  agent dials **out** to the control plane and stays connected, so managed
  servers need no open inbound management port.

```
 Browser ──▶ web (Next.js) ──▶ api (Hono) ◀──WebSocket── agent (on your VPS)
                                 │  ▲                       │ runs Docker: apps,
                                 ▼  │                       │ databases, nginx
                          Postgres  Redis ◀── worker (deploy jobs, alerts)
```

The design write-up is in [`docs/PHASE1_DESIGN.md`](./docs/PHASE1_DESIGN.md).

## Local development

Requires [Bun](https://bun.sh) 1.1+ and Docker (for local Postgres and Redis).

Config lives per app; Bun loads each app's own `.env`:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env
cp apps/web/.env.local.example apps/web/.env.local
```

Generate two secrets (`openssl rand -base64 32` each) and put
`DEPLYR_MASTER_KEY` and `DEPLYR_SESSION_SECRET` in `apps/api/.env`. Put the
**same** `DEPLYR_MASTER_KEY` in `apps/worker/.env` — both processes read and
write the same encrypted columns.

```bash
bun install
bun run infra:up           # Postgres + Redis in Docker
bun run db:migrate         # apply the schema

bun run dev:web            # http://localhost:3000  — UI
bun run dev:api            # http://localhost:4000  — API
bun run dev:worker         # background jobs
```

Open <http://localhost:3000>. On a fresh install you're guided through creating
the first account and connecting GitHub.

`bun run dev:agent` runs the agent itself. You normally don't — it's what gets
installed on a managed server. It skips connecting until `DEPLYR_CONTROL_PLANE_WS`,
`DEPLYR_SERVER_ID` and `DEPLYR_TOKEN` are set.

```bash
bun run typecheck          # every package
bun test                   # run inside a package (api, db, shared-types)
```

> Deploying to a server from a Mac is limited: Docker Desktop doesn't expose
> host networking, which deployed apps use. Use a real Linux server (or VM) as
> the managed server.

### Connecting GitHub

Deplyr needs a GitHub token to read the repos you deploy. Either:

- **OAuth app** (one-click "Continue with GitHub" for users): create an OAuth
  App at <https://github.com/settings/developers> and set `GITHUB_CLIENT_ID` and
  `GITHUB_CLIENT_SECRET`. The callback URL must match `GITHUB_OAUTH_REDIRECT_URI`
  (`http://localhost:4000/auth/github/callback` locally; you can register several
  redirect URIs on one app). Scopes requested: `read:user user:email repo`.
- **Personal access token**: no OAuth app needed. Paste a token with the `repo`
  scope (or a fine-grained token with read access to Contents and Metadata)
  in Settings. This is the easiest option for a private self-hosted instance.

### Notifications

Add a channel under **Notifications** in the sidebar. You need a webhook URL:
in Discord, *Channel settings → Integrations → Webhooks → New Webhook*; in Slack,
an app with *Incoming Webhooks* enabled. Deplyr sends a test message before it
saves the channel, so a broken webhook is caught immediately. Set `WEB_URL` on
the API and worker to get "Open in Deplyr" links in messages.

## Configuration

| Variable | App | Purpose |
|---|---|---|
| `DATABASE_URL`, `REDIS_URL` | api, worker | Postgres and Redis connections |
| `DEPLYR_MASTER_KEY` | api, worker | 32-byte base64 key that encrypts stored secrets (must match) |
| `DEPLYR_SESSION_SECRET` | api | Signs login sessions |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` / `GITHUB_OAUTH_REDIRECT_URI` | api | Optional GitHub OAuth (see above) |
| `WEB_URL` | api, worker | Public URL of the web app (CORS, redirects, links in alerts) |
| `DEPLYR_CONTROL_PLANE_WS` | worker | Public `ws(s)://…/agent/ws` URL agents dial back to |
| `DEPLYR_APP_DOMAIN` | worker, web | Base domain for deployed apps (`my-app.<domain>`) |
| `DEPLYR_WILDCARD_CERT_PEM` / `_KEY_PEM` | worker | Optional wildcard certificate for HTTPS on deployed apps |
| `API_URL`, `NEXT_PUBLIC_API_URL` | web | Server-side and browser URLs of the API |
| `DEPLYR_WEB_PORT` | caddy | Host port for the dashboard. Default `80` — override if this box also self-hosts apps (its own agent's nginx already owns 80/443); doing so forfeits automatic HTTPS |

`infra/install.sh` generates all of these for you on first install — the only
one you'd normally touch afterward is the domain, and that's now done from
**Settings → Instance address** in the dashboard itself, not by editing this
file (see below). Deplyr is self-hosted software with exactly one account per
instance; there's no multi-tenant "cloud" mode being offered, so there's
nothing here to configure for that.

## Self-hosting the control plane

Get a small Linux VPS from any provider (Hetzner, DigitalOcean, an EC2
instance — anything works), then run this on it:

```bash
curl -fsSL https://raw.githubusercontent.com/deplyr/deplyr/main/infra/install.sh | bash
```

That's the whole install. No Docker to set up by hand, no `.env` to write —
it installs Docker if it's missing, generates `DEPLYR_MASTER_KEY` and every
other secret, detects the box's public IP, and brings up Postgres, Redis, the
API, the worker, the dashboard and Caddy. It prints a URL when it's done.

1. **Open that URL.** First time, it's a setup page — pick an email and
   password. That's your one account for this instance; there's no invite
   flow or public sign-up here, on purpose (see
   [Status and known limitations](#status-and-known-limitations)).
2. **You're in — no domain required.** Deplyr already works over plain HTTP
   on the server's bare IP.
3. **Want a domain, with HTTPS?** Point its DNS A record at the server, then
   add it from **Settings → Instance address** in the dashboard, any time.
   No rebuild, no SSH, no editing files — the certificate is issued
   automatically within about a minute.
4. **Updating later:** SSH back in and run the exact same command again. It
   updates in place; your account, servers, projects and secrets are
   untouched.

This only stands up Deplyr itself — the box doesn't run any of *your* apps
yet. Add the server(s) you actually want to deploy to from **Servers →
Connect server** once you're logged in (see [How it works](#how-it-works)
above). That can be a different box, or **this same one** — Deplyr can
register the box it's running on as one of its own managed servers, in which
case set `DEPLYR_WEB_PORT` to something other than 80/443 first (the agent's
own nginx needs those, once installed) and re-run the install command to pick
it up. Both roles then share one Docker network on that box with no
isolation between them (see `docs/PHASE1_DESIGN.md`), so only do this if
every app deployed there is something you trust.

<details>
<summary>Prefer to do it by hand instead of running the installer?</summary>

1. Install Docker with the Compose plugin yourself.
2. Clone this repo and create a `.env` at its root — see `infra/install.sh`
   for the exact variables it would otherwise generate for you.
3. `docker compose -f infra/docker/docker-compose.prod.yml --env-file .env up -d --build`
4. Allow inbound **80** (the dashboard, and the HTTPS challenge on a domain),
   **443** (HTTPS, domain only) and **4000** (the API).

`DEPLYR_PUBLIC_URL`/`DEPLYR_PUBLIC_HOST` can still be set in `.env` up front
if you'd rather not use Settings for the domain — see the config table above.
</details>

## Status and known limitations

Being upfront, since this is early:

- **Not yet validated end to end on a real remote Linux server.** Each piece —
  detection, the build plan, database provisioning, stats, logs, notifications —
  has been exercised against real Docker and real GitHub, but the full path
  through nginx, SSL and the post-deploy health check on a fresh VPS is the next
  milestone.
- **The agent image needs publishing before first use, and after any change
  to `apps/agent`, `packages/shared-types` or `packages/config`.** There's no
  CI for this on purpose (publishing on every push to `main` would be
  wasteful) — run `infra/publish-agent.sh` yourself when the agent is ready
  to ship. It builds a multi-arch (amd64 + arm64) image from
  `infra/docker/agent.Dockerfile` and pushes it to `ghcr.io/deplyr/agent`;
  `infra/publish-agent.sh --no-push` builds locally first if you want to try
  it before pushing. Requires `docker login ghcr.io` with a token that has
  `write:packages`, and the `ghcr.io/deplyr/agent` package needs to be made
  public once (its GitHub Packages page → Package settings).
- **The free `*.deplyr.app`-style address is HTTP-only unless you supply a
  wildcard certificate.** Custom domains (any project can add its own) get a
  real certificate automatically via Let's Encrypt.
- **The control plane itself runs over plain HTTP** by default, so the session
  cookie and any SSH credentials you paste travel unencrypted. Put a TLS-terminating
  reverse proxy in front of it before using it for anything sensitive.
- **Databases are private-only.** There is no public exposure or firewall
  management yet; connect from your machine over an SSH tunnel.
- **Your app must listen on `$PORT`.** Deplyr assigns the port and sets it.
- Existing servers need the agent updated when the agent's commands change.

## Security notes

- Everything sensitive at rest (GitHub tokens, SSH credentials, secret values,
  database passwords, webhook URLs) is encrypted with AES-256-GCM using
  `DEPLYR_MASTER_KEY`. **Losing that key means losing those secrets** — back it up.
- Secret values are never logged; the activity log records *which* secret was
  touched, not its value.
- Notification webhooks are restricted to Slack and Discord's real hosts, so a
  saved URL can't be used to make the server call arbitrary addresses.
- Databases bind to `127.0.0.1` on the managed server.

## Repository layout

```
apps/
  web/      Next.js control-plane UI
  api/      Hono API + the agent WebSocket endpoint
  worker/   BullMQ processors: deploys, database jobs, health checks, alerts
  agent/    Bun daemon installed on managed servers
packages/
  db/            Drizzle schema, migrations, encryption, audit + notify helpers
  shared-types/  Zod schemas and pure logic shared by every app
  queue/         BullMQ queue definitions and the agent RPC bridge
  config/        shared tsconfig
infra/
  agent-install.sh   bootstrap script run over SSH on a new server
  docker/            Dockerfiles and compose files (dev and self-hosted prod)
docs/
  PHASE1_DESIGN.md   architecture, schema, agent auth and pipeline design
```

## License

[MIT](./LICENSE)
