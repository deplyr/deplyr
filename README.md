# Deplyr

**Turn any server into your own deploy platform.**

Deplyr is an open-source, self-hosted platform. Connect GitHub, pick a repo, and
it's live on a server you own, with a database, a domain, free HTTPS, logs,
monitoring and alerts. No server knowledge needed.

Website: <https://deplyr.abhilaksharora.com>

## Install

You need a small Linux server (any provider) with ports **80** and **443** open.
Then run one command on it:

```bash
curl -fsSL https://deplyr.abhilaksharora.com/install.sh | bash
```

It installs Docker if needed, sets everything up, and prints the address of your
dashboard when it's done.

## Use it

1. **Open the address** the installer printed and create your account.
2. **Connect GitHub** with a personal access token (the app walks you through it).
3. **Create a project.** Choose a repo and Deplyr detects the framework for you.
4. **Add environment variables** if your app needs any.
5. **Press Deploy.** Watch each step live. When it's done, your app is online.

The server you installed on is already registered as **This server**, so you can
deploy straight away.

**Add a domain:** point the domain's DNS `A` record at your server, then add it in
the project's **Domains** tab. Deplyr checks the DNS and sets up HTTPS on its own.

**Add another server:** **Servers → Connect server**, then enter its IP and SSH
login once. After that Deplyr manages it without SSH.

**Update Deplyr:** run the install command again. Your data stays as it is.

## What you get

- **Deploy from GitHub.** Next.js, NestJS, plain Node, or anything with a Dockerfile.
- **Databases.** PostgreSQL and Redis in one click, private by default.
- **Domains and HTTPS.** A free address for every app, or bring your own domain.
  Certificates are issued and renewed automatically.
- **Environment variables.** Stored encrypted and available to your build and your app.
- **Logs and monitoring.** Live logs, server stats, and health checks on every app.
- **Alerts.** Discord and Slack messages when something goes down or a deploy finishes.
- **Many servers, one dashboard.** One server is enough. Add more whenever you like.

## How it works, in short

```
 Browser ──▶ Dashboard ──▶ API ◀── secure connection ── Agent (on each server)
                            │                             runs your apps
                            ▼                             and databases
                    Postgres + Redis ◀── Worker (deploys, checks, alerts)
```

- The **dashboard, API and worker** run together on the server you install on.
- A small **agent** runs on every server that hosts apps. It connects out to
  Deplyr and does the actual work: build, start, health checks, logs.
- Your apps run as **Docker containers**. **Caddy** is the front door that serves
  the dashboard and every app, with automatic HTTPS.

Full details are in the [docs](./docs/README.md).

## Documentation

| | |
|---|---|
| [Architecture](./docs/architecture.md) | The parts, and how they talk to each other |
| [Deploy pipeline](./docs/deploy-pipeline.md) | What happens between "Deploy" and "live" |
| [Agent](./docs/agent.md) | The service on each server, and its protocol |
| [Domains and HTTPS](./docs/domains-and-ssl.md) | Addresses, DNS checks, certificates |
| [Databases](./docs/databases.md) | Postgres and Redis on your servers |
| [Monitoring and alerts](./docs/monitoring-and-alerts.md) | Health checks, activity log, notifications |
| [Security](./docs/security.md) | Encryption, sessions, access |
| [Configuration](./docs/configuration.md) | Every setting and environment variable |
| [Development](./docs/development.md) | Run it locally, repo layout, contributing |

## Future scope

- More languages and frameworks (Python, Go, static sites)
- One-click rollbacks to a previous deploy
- Automatic deploys on every `git push`, and preview deploys for pull requests
- Scheduled database backups and restores
- Team members with roles
- Zero-downtime deploys
- Wildcard HTTPS for the free app addresses
- More alert channels (email, webhooks)

## Contributing

Issues and pull requests are welcome. See [Development](./docs/development.md)
to run it locally.

## License

[MIT](./LICENSE)
