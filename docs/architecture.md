# Architecture

## The parts

| Part | Technology | Job |
|---|---|---|
| **Web** | Next.js | The dashboard you use in the browser |
| **API** | Hono on Bun | Accounts, projects, servers, settings; holds the agent connections |
| **Worker** | BullMQ on Bun | Background jobs: deploys, databases, domains, health checks |
| **Agent** | Bun | Runs on each server; builds and runs apps and databases |
| **Postgres** | PostgreSQL | All Deplyr data |
| **Redis** | Redis | Job queues and the message channel between worker and API |
| **Caddy** | Caddy 2 | The front door: routing and automatic HTTPS |

Web, API, worker, Postgres, Redis and Caddy run together as one Docker Compose
stack (`infra/docker/docker-compose.prod.yml`) on the server you install on.

## The big picture

```
                    ┌────────────── the server you install on ──────────────┐
                    │                                                       │
 Browser ──443/80──▶│  Caddy ──▶ Web (dashboard)                            │
                    │    │  └──▶ API ◀──────────── Agent (This server)      │
                    │    │        │  ▲                  runs your apps      │
                    │    ▼        ▼  │                                      │
                    │  your apps  Postgres   Redis ◀── Worker              │
                    └───────────────────────────────────────────────────────┘
                                          ▲
                              secure WebSocket, opened by the agent
                                          │
                              ┌───────────┴───────────┐
                              │  Agent (extra server) │  runs apps + databases
                              └───────────────────────┘
```

## How a request flows

**Using the dashboard.** The browser talks to Caddy on port 80 or 443. Caddy sends
`/api/*` to the API and everything else to the web app. The browser and the API
share one address, so cookies and HTTPS just work.

**Doing something on a server.** When you press Deploy, the API creates a record
and queues a job. The worker picks it up and sends commands one at a time to the
right agent through Redis and the API. The agent runs each command and streams
log lines back. The worker records progress, and the dashboard shows it live.

```
Dashboard ─▶ API ─▶ queue (Redis) ─▶ Worker ─▶ Redis channel ─▶ API ─▶ Agent
                                                                        │
Dashboard ◀── API ◀── Postgres ◀── Worker ◀── Redis channel ◀── API ◀───┘
                                            (logs, results)
```

The worker and the API are separate processes, and the agent is connected to the
API. A Redis publish/subscribe channel carries commands to the API, which forwards
them to the agent's socket. Replies come back the same way, matched by request ID.

## Servers

**This server.** When the first account is created, Deplyr registers the machine it
runs on as a server named *This server*. Its agent runs directly on the host (Docker
host networking) and connects to the API through Caddy on the loopback address, so
no SSH, public IP or firewall rule is involved.

**Extra servers.** You enter an IP and an SSH password or key once. The worker
connects over SSH, runs the agent installer (which installs Docker, nginx and the
agent), and gives the agent its own secret token. After that the agent connects out to Deplyr
and SSH is never used again. An extra server needs no open management port. It only
needs to reach Deplyr's port 4000.

## Routing

Caddy's configuration is generated from the database, not written by hand. The API
rebuilds and applies it when it starts and whenever what Caddy serves changes: an
app is deployed or deleted, a domain is added or removed, or the instance domain
changes.

It contains:

- the dashboard on the server's address (and on the instance domain, if set)
- the API under `/api`, and on port 4000 for agents and OAuth callbacks
- one site per app on the local server, forwarded to the app's port on the host
- one site per verified custom domain on the local server

Apps on extra servers are routed by nginx on those servers instead.

## Data

All state is in Postgres (Drizzle ORM, migrations applied on start).

| Table | Holds |
|---|---|
| `users` | The single account, and its encrypted GitHub token |
| `servers`, `server_metrics` | Registered servers, status, CPU/memory/disk history |
| `projects` | Repo, branch, framework, build settings, assigned port, subdomain |
| `secrets` | Per-project environment variables (encrypted) |
| `deploys`, `deploy_steps` | Each deploy and the status and log of every step |
| `databases`, `database_metrics` | Provisioned databases and their stats history |
| `domains` | Custom domains with DNS and certificate status |
| `notification_channels`, `notifications`, `alert_state` | Alert channels, delivery history, de-duplication |
| `audit_events` | The activity log |
| `instance_settings` | The instance's own custom domain |

## Background jobs

| Queue | Purpose |
|---|---|
| `server-install` | Connect over SSH and install the agent |
| `deploy-run` | The deploy pipeline |
| `db-provision`, `db-ops` | Create databases; start, stop, restart, remove |
| `health-check` | Every 60s, check every live app |
| `domain-verify`, `domain-remove`, `domain-renew` | Domain setup, teardown and daily renewal |
