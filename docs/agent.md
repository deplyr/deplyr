# Agent

The agent is a small Bun program that runs on every server hosting apps. It is
published as the image `ghcr.io/deplyr/agent`, for both amd64 and arm64.

It does the work on the machine: builds images, starts containers, provisions
databases, writes routing config, reads logs and reports how the machine is doing.

## Connection

The agent **opens the connection itself** to `/agent/ws` on the API and keeps it
open. Deplyr never has to reach into the server.

1. The agent connects and sends `auth` with its server ID and token.
2. The API checks the token against a stored argon2id hash.
3. Once accepted, the server shows as **connected**.
4. If the connection drops, the agent reconnects with a delay that grows from 1 to
   30 seconds.

Each server has its own token. It is created when the server is registered, and only
the hash is stored in Deplyr.

## Messages

All messages are JSON, defined and validated in `packages/shared-types`.

| Direction | Message | Purpose |
|---|---|---|
| agent → API | `auth` | Identify and prove who it is |
| API → agent | `command` | Do one thing (`requestId`, `name`, `payload`) |
| agent → API | `log` | One line of output for a command |
| agent → API | `result` | The command finished: success or failure, with detail |
| agent → API | `heartbeat` | CPU, memory, disk, load, cores, uptime (every 15s) |
| agent → API | `db_stats` | Health and stats for each database (every 30s) |

## Commands

| Group | Commands |
|---|---|
| Deploy | `deploy.clone`, `deploy.install`, `deploy.write_env`, `deploy.build`, `deploy.start`, `deploy.nginx`, `deploy.ssl`, `deploy.health_check` |
| Databases | Provision Postgres or Redis; start, stop, restart, remove; run a console query (`db.exec`) |
| Domains | Configure a domain, issue a certificate, renew all, remove |
| Logs | Read container logs for apps and databases |

Each command runs as a child process. Its output is sent line by line as `log`
messages, and it ends with exactly one `result`.

## Metrics

Heartbeats are stored as history and drive the server page's charts (1 hour to
7 days). If heartbeats stop, the server is marked offline after a 60 second grace
period, and an alert is sent if a channel is set up.

## Installing the agent

**This server:** the installer starts the agent on the host with a token it
generated, and Deplyr registers it when the first account is created.

**Extra servers:** the worker connects over SSH and runs `infra/agent-install.sh`,
which installs Docker and nginx and starts the agent with its server ID, token and
the address of the control plane.

## What the agent runs

- **Apps** run as containers with host networking and `--restart` enabled, named
  `deplyr-<project>`.
- **Databases** run as containers bound to the server's loopback address.
- **Files** live under `/var/lib/deplyr`: a source folder and an environment file
  per project.
