# Configuration

The installer generates every value below and writes them to a `.env` file in the
install folder, so a normal install needs no editing. This page is the reference.

## Environment variables

| Variable | Used by | Purpose |
|---|---|---|
| `DATABASE_URL`, `REDIS_URL` | api, worker | Postgres and Redis connections |
| `DEPLYR_MASTER_KEY` | api, worker | 32-byte base64 key that encrypts stored secrets. Must be identical for both. |
| `DEPLYR_SESSION_SECRET` | api | Signs login sessions |
| `DEPLYR_PUBLIC_URL`, `DEPLYR_PUBLIC_HOST` | api, worker | The address Deplyr is reached at |
| `DEPLYR_SITE_ADDRESS` | caddy | The address Caddy serves the dashboard on |
| `DEPLYR_WEB_PORT` | caddy | Host port for the dashboard. Default `80`. |
| `WEB_URL` | api, worker | Public URL of the dashboard (CORS, redirects, links in alerts) |
| `API_URL` | web | Server-side URL of the API |
| `NEXT_PUBLIC_API_URL` | web | The browser's path to the API. `/api` on whatever address you open Deplyr at. |
| `DEPLYR_CONTROL_PLANE_WS` | worker | The `ws(s)://…/agent/ws` address agents on extra servers connect to |
| `DEPLYR_APP_DOMAIN` | worker, web | Base domain for app addresses (`my-app.<domain>`) |
| `DEPLYR_WILDCARD_CERT_PEM`, `DEPLYR_WILDCARD_KEY_PEM` | worker | Optional wildcard certificate for HTTPS on app addresses on extra servers |
| `DEPLYR_LOCAL_SERVER_ID`, `DEPLYR_LOCAL_AGENT_TOKEN` | api, installer | Identity of the local server and its agent |
| `CADDY_ADMIN_URL` | api, worker | Where Caddy's admin API is (internal). Default `http://caddy:2019`. |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_OAUTH_REDIRECT_URI` | api | Optional GitHub OAuth sign-in |
| `NEXT_PUBLIC_SITE_URL` | web | Public URL used for SEO tags on the website |
| `NEXT_PUBLIC_MARKETING_ONLY` | web | Set to `1` to serve only the landing page and docs |

## Settings in the dashboard

| Where | Setting |
|---|---|
| **Settings → Instance address** | The domain Deplyr's dashboard is served on |
| **Settings → GitHub** | The GitHub connection (token) |
| **Project → Settings** | Framework, root folder, install, build and start commands, Node version, health check path |
| **Project → Environment** | The project's environment variables |
| **Project → Domains** | Custom domains |
| **Notifications** | Discord and Slack channels |

## Connecting GitHub

Deplyr needs a GitHub token to read your repos. Two ways:

**Personal access token (simplest).** In GitHub → Settings → Developer settings →
Personal access tokens, create a token with the `repo` scope (classic), or a
fine-grained token with read access to Contents and Metadata for the repos you want.
Paste it in Deplyr's GitHub settings.

**OAuth app.** Create an OAuth App at <https://github.com/settings/developers>, set
`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` and `GITHUB_OAUTH_REDIRECT_URI` (the
callback is `<your-address>:4000/auth/github/callback`), and users get a
**Continue with GitHub** button.

## Updating and backups

**Update:** run the install command again. It updates in place and keeps your data.

**Back up** the install folder's `.env` (especially `DEPLYR_MASTER_KEY`) and the
Postgres volume. Without the master key, stored secrets can't be decrypted.
