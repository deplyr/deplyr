# Deplyr documentation

These pages explain how Deplyr works, from the big picture down to the details.
If you only want to install and use it, the [README](../README.md) is enough.

| Page | What it covers |
|---|---|
| [Architecture](./architecture.md) | Every part of the system and how they connect |
| [Deploy pipeline](./deploy-pipeline.md) | The steps from "Deploy" to a live app |
| [Agent](./agent.md) | The service on each server, connection, commands, metrics |
| [Domains and HTTPS](./domains-and-ssl.md) | App addresses, custom domains, certificates |
| [Databases](./databases.md) | Postgres and Redis provisioning, access, stats |
| [Monitoring and alerts](./monitoring-and-alerts.md) | Health checks, activity log, Discord and Slack |
| [Security](./security.md) | Encryption, sessions, network exposure |
| [Configuration](./configuration.md) | Environment variables and settings |
| [Development](./development.md) | Run locally, repo layout, tests |

**Words used in these docs**

- **Control plane**: Deplyr itself. The dashboard, API and worker.
- **Server**: any Linux machine that runs your apps. The one Deplyr is installed on
  is registered automatically as *This server*.
- **Agent**: the small program on a server that carries out Deplyr's instructions.
- **Project**: one app connected to a GitHub repo and branch.
