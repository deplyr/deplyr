# Deplyr — Phase 1 Design

Scope: one stack (Next.js/Node), one server topology (control plane + agent
can target a single VPS; no multi-server orchestration), free `*.deplyr.app`
subdomain only, one Slack alert rule. See the top-level project brief for
full context and the explicit non-goals list — nothing below should exceed
that scope.

Runtime/tooling choice: **Bun workspaces** across the whole monorepo (no
Turborepo yet — add it later if build graph complexity actually demands it).
Bun runs the Next.js dev/build scripts fine and is the stated runtime for
the agent, so one toolchain everywhere keeps Phase 1 simple.

---

## 1. Monorepo structure

```
deplyr/
├── apps/
│   ├── web/                 # Next.js (App Router) — control plane UI only.
│   │                         #   Talks to apps/api over HTTP + WebSocket.
│   │                         #   No business logic lives here.
│   ├── api/                  # Hono API server — control plane backend.
│   │   │                     #   REST endpoints (auth, projects, servers,
│   │   │                     #   secrets, deploys) + a WebSocket endpoint
│   │   │                     #   agents connect out to, and a WebSocket/SSE
│   │   │                     #   endpoint the web UI subscribes to for live
│   │   │                     #   deploy logs.
│   │   └── src/
│   │       ├── routes/
│   │       ├── ws/agent.ts   # agent connection registry + protocol handling
│   │       └── ws/logs.ts    # UI-facing log/metric stream
│   ├── worker/                # BullMQ workers — all long-running/queued
│   │   └── src/jobs/          #   work: server install, deploy pipeline,
│   │                          #   db provisioning, health-check loop,
│   │                          #   Slack alert delivery.
│   └── agent/                  # Bun + Hono daemon shipped to the user's VPS.
│       └── src/
│           ├── connect.ts      # outbound WS client to control plane + auth
│           ├── commands/       # clone/install/build/start/nginx/ssl/health
│           └── metrics.ts      # CPU/RAM/disk sampling
│
├── packages/
│   ├── db/                    # Drizzle ORM schema + migrations + typed
│   │                          #   client. Imported by apps/api and
│   │                          #   apps/worker (never by apps/web directly).
│   ├── shared-types/           # Zod schemas: agent protocol messages, job
│   │                          #   payloads, API request/response DTOs.
│   │                          #   Imported by all four apps.
│   ├── queue/                  # BullMQ queue names + typed job definitions,
│   │                          #   shared by apps/api (enqueue) and
│   │                          #   apps/worker (process).
│   └── config/                  # shared tsconfig/eslint/prettier config.
│
├── infra/
│   ├── agent-install.sh        # bootstrap script the control plane pipes
│   │                          #   over the SSH session during registration.
│   └── docker/                  # Dockerfiles for web/api/worker + a
│                              #   docker-compose.yml for local dev
│                              #   (Postgres + Redis).
│
├── docs/
├── package.json                # bun workspaces root
└── bunfig.toml
```

Why split `api` from `worker` instead of running BullMQ jobs inline in the
API process: the deploy pipeline and SSH install jobs are long-running and
retryable, and separating them means the API stays responsive for UI
requests and log-stream subscriptions while jobs churn. It also matches
where Phase 2 multi-server work will need to go (more workers, not a
heavier API).

Not painted into a corner: `apps/api`'s agent-connection registry is
in-process for Phase 1 (single API instance). Scaling the control plane to
multiple instances later means moving that registry to Redis pub/sub — the
WS protocol itself (section 3) doesn't need to change for that.

---

## 2. Postgres schema (Phase 1 only)

Using Drizzle syntax conceptually; types abbreviated.

```
users
  id                  uuid pk
  email               text unique not null
  github_id           text unique not null
  github_login        text not null
  github_access_token bytea not null        -- encrypted (see below)
  created_at          timestamptz default now()

servers
  id                    uuid pk
  user_id               uuid fk -> users.id
  name                  text not null              -- user-given label
  ip_address            inet not null
  ssh_credential        bytea not null              -- encrypted password OR private key
  ssh_credential_type   text not null check in ('password','private_key')
  agent_token_hash      text not null               -- argon2 hash, never store raw token
  status                text not null default 'pending'
                          -- pending | installing | connected | error
  status_detail         text                        -- last error message, if any
  docker_installed      boolean default false
  agent_connected_at    timestamptz
  created_at            timestamptz default now()
  updated_at            timestamptz default now()

projects
  id                    uuid pk
  user_id               uuid fk -> users.id
  server_id             uuid fk -> servers.id
  name                  text not null
  subdomain             text unique not null        -- "<slug>.deplyr.app"
  github_repo           text not null                -- "owner/repo"
  github_branch         text not null default 'main'
  framework             text                          -- 'nextjs' | 'node' | null until detected
  app_port              integer                        -- local port nginx proxies to
  status                text not null default 'created'
                          -- created | deploying | live | failed
  created_at            timestamptz default now()
  updated_at            timestamptz default now()

secrets
  id            uuid pk
  project_id    uuid fk -> projects.id
  key           text not null                       -- e.g. "DATABASE_URL"
  value         bytea not null                        -- encrypted
  source        text not null default 'user'          -- 'user' | 'system' (e.g. db-provisioned)
  created_at    timestamptz default now()
  updated_at    timestamptz default now()
  unique(project_id, key)

databases
  id                    uuid pk
  project_id            uuid fk -> projects.id
  type                  text not null default 'postgres'   -- postgres only, Phase 1
  container_name        text not null
  port                  integer not null
  connection_secret_key text not null default 'DATABASE_URL' -- fk-by-name into secrets
  status                text not null default 'provisioning'
                          -- provisioning | running | error
  created_at            timestamptz default now()

deploys
  id            uuid pk
  project_id    uuid fk -> projects.id
  status        text not null default 'queued'
                  -- queued | running | success | failed
  commit_sha    text
  started_at    timestamptz
  finished_at   timestamptz
  created_at    timestamptz default now()

deploy_steps
  id            uuid pk
  deploy_id     uuid fk -> deploys.id
  name          text not null
                  -- clone | install | build | write_env | start |
                  -- nginx | ssl | health_check
  order_index   integer not null
  status        text not null default 'pending'
                  -- pending | running | success | failed
  log           text default ''                       -- appended to as it streams
  started_at    timestamptz
  finished_at   timestamptz

notification_channels
  id            uuid pk
  project_id    uuid fk -> projects.id
  type          text not null default 'slack'          -- slack only, Phase 1
  webhook_url   bytea not null                           -- encrypted
  created_at    timestamptz default now()

alert_state
  id                  uuid pk
  project_id          uuid fk -> projects.id unique      -- one row per project, Phase 1
  channel_id          uuid fk -> notification_channels.id
  is_healthy          boolean default true
  last_checked_at     timestamptz
  last_alert_sent_at  timestamptz
```

Notes:
- `alert_state` deliberately isn't a generic "rules" table — Phase 1 has
  exactly one hardcoded rule (health check fails → Slack), so this is just
  enough state to avoid re-alerting on every failed check (edge-triggered,
  not level-triggered).
- Encryption: `github_access_token`, `ssh_credential`, `secrets.value`, and
  `notification_channels.webhook_url` all go through the same envelope
  encryption helper in `packages/db` (AES-256-GCM, key from an env-provided
  master key). One helper, one code path, so there's no divergent handling
  of "sensitive column" across the app.

---

## 3. Agent auth & control-plane ↔ agent communication

This is the piece most likely to bite us later if under-designed, so here's
the reasoning, not just the shape.

### The constraint that decides the design

The user's VPS is arbitrary — we don't control its firewall/NAT. We *can't*
assume the control plane can open an inbound connection to the agent.
We *can* assume outbound 443 works, because that's what lets the VPS pull
Docker images and talk to Let's Encrypt/GitHub at all.

So: **the agent always dials out to the control plane**, never the reverse.
This is the same shape Tailscale/Coolify-style tools use, and it sidesteps
an entire class of "user has to open a port" support burden.

### Registration flow (server → "Connected")

1. UI submits IP + root password or private key. API creates a `servers`
   row (`status: pending`) and enqueues `server:install` on the worker.
2. Worker decrypts the credential in-memory only for the duration of the
   job, opens an SSH connection (`ssh2` package), and runs
   `infra/agent-install.sh` on the box:
   - installs Docker if missing (`get.docker.com`),
   - generates a random 256-bit agent token **on the control-plane side**
     (not on the box),
   - starts the agent as a Docker container:
     `docker run -d --name deplyr-agent --restart unless-stopped
     -v /var/run/docker.sock:/var/run/docker.sock
     -e DEPLYR_TOKEN=<token> -e DEPLYR_SERVER_ID=<server_id>
     -e DEPLYR_CONTROL_PLANE_WS=wss://api.deplyr.app/agent/ws
     ghcr.io/deplyr/agent:latest`
   - the agent container is **not** port-published — it never listens for
     inbound traffic. It only opens the outbound WS above.
3. The worker stores `argon2(token)` in `servers.agent_token_hash` (the raw
   token exists only transiently, passed as an env var over the SSH
   session — never written to the DB in plaintext, never logged).
4. Agent boots, connects to the WS endpoint, sends
   `{type: "auth", serverId, token}`. API looks up the server, verifies
   `argon2.verify(token, agent_token_hash)`, and on success registers the
   socket in the (in-process, Phase 1) connection registry keyed by
   `server_id`.
5. API marks `servers.status = 'connected'`, `agent_connected_at = now()`.
   Worker job was waiting on this (with a timeout, e.g. 2 minutes) and
   resolves — UI shows "Connected." A timeout surfaces as `status: 'error'`
   with `status_detail` set to something human-readable, not a raw SSH
   trace.

The root credential is kept (encrypted) after install, not discarded —
Phase 1 needs it for one realistic case: the agent container is gone (VPS
rebooted with Docker not set to restart correctly, box was rebuilt, etc.)
and we need to SSH back in to reinstall. This is a deliberate tradeoff
(more stored secret surface vs. a support dead-end); flagging it explicitly
since "discard after use" is the more conservative default and worth a
second opinion.

### Ongoing protocol (post-connection)

Single persistent WebSocket per server, agent-initiated, auto-reconnecting
with exponential backoff on drop (network blip, control-plane deploy,
VPS reboot). Two message shapes ride the same socket:

- **Control plane → agent (commands):**
  `{ type: "command", requestId, name: "deploy.clone" | "deploy.build" | ... , payload }`
  Each deploy step is one command. The agent runs it and streams progress
  back tagged with the same `requestId`.
- **Agent → control plane (events):**
  `{ type: "log", requestId, line }` — appended to `deploy_steps.log` and
  fanned out to any UI subscriber watching that deploy (via the separate
  UI-facing WS/SSE endpoint in `apps/api`, keyed by `deploy_id`).
  `{ type: "result", requestId, status: "success"|"failure", detail }` —
  resolves the worker job waiting on that step.
  `{ type: "heartbeat", cpu, memPercent, diskPercent }` — sent every ~15s
  regardless of command activity, persisted for the monitoring dashboard
  and used as the liveness signal (`servers.status` flips to `error` if a
  connected server misses several heartbeats and the socket is dead).

Correlating `requestId` end-to-end (worker job ⇄ WS command ⇄ agent
response ⇄ deploy_steps row ⇄ UI subscriber) is what makes "one Deploy
click → live human-readable checklist" work without polling.

### Trust boundary

The agent runs with Docker socket access, which is root-equivalent on the
box. That's accepted as the Phase 1 trust model: the user already handed us
root SSH once to install it. Worth stating plainly in the UI at
registration time ("Deplyr will have full control of this server") rather
than leaving it implicit.

---

## 4. Phase 1 build sequence (one PR each, reviewable independently)

1. **Monorepo scaffold** — Bun workspaces, empty `apps/{web,api,worker,agent}`,
   `packages/{db,shared-types,queue,config}`, Drizzle schema from §2 +
   initial migration, `docker-compose.yml` for local Postgres+Redis, root
   dev scripts. No features; `bun install && bun dev` boots four empty
   shells that can talk to a local DB.

2. **Auth + server registration** — "Sign in with GitHub" doubles as both
   control-plane login *and* the repo-access grant (one OAuth flow, no
   separate email/password system). Server registration form → SSH install
   job → agent skeleton (connects out, authenticates, sends heartbeats) →
   UI showing live server status (pending/installing/connected/error) per
   the design in §3.

3. **GitHub repo connect + framework detection** — list repos/branches via
   the token from step 2; project-creation flow (pick server + repo +
   branch); framework detector (shallow clone, check `package.json` for a
   `next` dependency or `build`/`start` scripts); clear "not supported yet"
   message on anything else; `projects` row created with subdomain
   assigned.

4. **Secrets** — scan for `.env.example` on project creation, render a
   friendly form (best-effort label derived from the key name), encrypt +
   store, reveal-on-click in the UI.

5. **Deploy pipeline** — the full agent command sequence (clone → install →
   build → write `.env` → `pm2 start` → nginx config for
   `<subdomain>.deplyr.app` → reload → health check on `/`), wired through
   the §3 protocol; `deploy_steps` rows + live log streaming; manual
   "Deploy" button; the human-readable checklist UI. Wildcard TLS: the
   control plane owns one `*.deplyr.app` cert (obtained once, out of band),
   pushed to the agent at nginx-config time — no per-user ACME flow needed
   yet.

6. **Postgres provisioning** — "Add a Postgres database" button → agent
   runs a Docker Postgres container, allocates a port, generates
   credentials → `DATABASE_URL` written into `secrets` automatically →
   prompts a re-deploy to pick it up.

7. **Monitoring + Slack alerting** — dashboard fed by the heartbeat stream
   from step 2 (CPU/RAM/disk, traffic-light status); repeatable BullMQ job
   hitting `https://<subdomain>.deplyr.app/` every N minutes; Slack channel
   setup (paste Incoming Webhook URL); hardcoded alert rule (health-check
   fail or process down → Slack message) using `alert_state` to avoid
   re-alerting every interval; deploy history list + "View live logs" link
   on the dashboard.

Each PR should leave the app in a runnable (if incomplete) state — no PR
should depend on a later one to build or boot.

---

## 5. PR5 addendum: deploy pipeline architecture

Written while building PR5, once the shape of the problem was concrete
enough to pin down. Three decisions here revise or sharpen §1–§4.

### 5.1 Docker containers, not pm2, run the deployed app

§4's PR5 description said "start with pm2." Building it, that turned out
to be the wrong call, and the user's own later UX walkthrough — which
names "Docker deployment" as an explicit pipeline stage — confirms the
right one: **every deployed app runs as its own long-lived Docker
container**, supervised by `--restart unless-stopped`, not by pm2.

Why the reversal: the agent itself runs *inside* a Docker container (per
§3's registration flow). For pm2 to manage a host-level process, the agent
would need to escape its own container's PID namespace — there's no clean
way to do that without granting it far more host access than "has
docker.sock" implies. Docker containers sidestep the problem entirely:
the agent already has docker.sock mounted, so spinning up a sibling
container for the app is the naturally-available primitive, not an extra
grant. It also means an app's lifecycle survives an agent restart/upgrade,
which a pm2 process tree living inside the agent's own container would
not.

Each pipeline step below is a **separate, individually-logged `docker
run`/`docker exec` invocation** against a generic `node:20-slim` image with
the project's cloned source bind-mounted — not a synthesized Dockerfile or
a multi-stage build. That keeps `install`, `build`, and `start` as three
genuinely distinct, separately-retryable steps (matching the checklist UI)
without needing to parse `docker build` output to find step boundaries:

- `install`: `docker run --rm -v <src>:/app -w /app node:20-slim npm install`
- `build`: same shape, `npm run build`
- `start`: `docker run -d --name deplyr-<project-slug> --restart unless-stopped
  --network host -v <src>:/app -w /app --env-file <src>/.env node:20-slim
  npm run start`

All app containers (and the agent's own container, and nginx — see below)
use `--network host`. Every app on a box needs a distinct port either way
(nginx has to proxy each subdomain somewhere unambiguous), so host
networking sidesteps Docker's bridge-network-to-host reachability problem
(`127.0.0.1` inside a bridge-mode container is *itself*, not the host)
instead of routing around it with `host.docker.internal` gateways. Only
Postgres containers (PR6) get isolated bridge networking with a published
port — deliberately, since a database is exactly the thing worth not
putting on the host network.

Port allocation: the worker picks an unused port in `20000–29999` (checked
against `projects.appPort` across all projects) on a project's first
deploy and persists it — re-deploys reuse the same port.

### 5.2 nginx runs as a sibling container the agent writes config into

Same reasoning as above applies to nginx: rather than reaching for a
host-level nginx via systemd (which the agent, containerized, can't cleanly
reach), `infra/agent-install.sh` (PR2's script, extended here) now also
starts a persistent `deplyr-nginx` container (`nginx:alpine`, `--network
host`, `--restart unless-stopped`) with a host directory
(`/var/lib/deplyr/nginx/conf.d`) bind-mounted into both the agent (which
writes files there) and nginx (which serves `conf.d/*.conf` via its base
`nginx.conf`). The `nginx` deploy step writes `<slug>.conf` there and runs
`docker exec deplyr-nginx nginx -s reload` — no host nginx installation, no
systemd, nothing outside Docker's blast radius.

### 5.3 Wildcard SSL is operator-supplied, not obtained by this build

§4 said the control plane "owns one `*.deplyr.app` cert, obtained once, out
of band." Obtaining a real one requires a real registered domain with DNS
under the operator's control — not something this build can do for you.
So: the `ssl` step looks for `DEPLYR_WILDCARD_CERT_PEM` /
`DEPLYR_WILDCARD_KEY_PEM` on the control plane (worker passes their content
to the agent as part of the `deploy.ssl` command payload if set). If
they're set, the agent writes them to `/var/lib/deplyr/certs/` (idempotent,
shared across every project on the box) and the nginx config gets an HTTPS
server block. **If they're not set, the step succeeds with a warning
logged** ("no wildcard certificate configured — app is reachable over
HTTP only") rather than blocking the pipeline — Phase 1's "free wildcard
subdomain" promise is real once an operator points a real domain's
wildcard DNS at their box and supplies a cert; without that, the honest
fallback is plain HTTP, not a failed deploy.

### 5.4 api and worker are different processes — a Redis pub/sub bridge connects them

§3 flagged the in-process agent-connection registry as "a Phase 2 concern"
for scaling to multiple API instances. Building the deploy pipeline surfaced
that this isn't only a scaling concern: **api and worker are two separate
processes from day one in this Phase 1 topology**, and the deploy job
(running in worker) needs to send commands to an agent whose WebSocket
connection is held in api's process memory, then get results and live log
lines back — a much more interactive exchange than server:install's
"fire once, poll the DB for a status flag."

Rather than merging api and worker into one process (undoing the
separation of concerns §1 argued for) or building a slower DB-polling
request/response loop, PR5 adds a small Redis pub/sub bridge
(`packages/queue`'s `agent-bridge.ts`): worker publishes `{serverId,
command}` on an `agent:commands` channel; api (subscribed once, at
startup) looks up the connection in its registry and forwards it, or
publishes an immediate failure if that server isn't connected; api
publishes every `log`/`result`/`heartbeat` event it receives from an agent
onto `agent:events`; worker subscribes and correlates by `requestId`.
Ordinary Redis pub/sub, not BullMQ — there's nothing here worth persisting
or retrying at the message level, since a dropped connection should fail
the step, not silently retry into a stale one.

This assumes a single worker instance, same as api assumes a single
instance for its in-process registry (documented in §3) — multiple workers
would all receive every event over pub/sub and duplicate step-completion
logic. Revisit both together if Phase 2 needs horizontal scaling.
