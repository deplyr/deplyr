import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  Cpu,
  Database,
  Github,
  Globe,
  Info,
  KeyRound,
  Lock,
  Rocket,
  Server,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { CopyButton } from "@/components/ui/copy-button";
import { Page, PageHeader } from "@/components/ui/page";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// building blocks
// ---------------------------------------------------------------------------

function InlineCode({ children }: { children: ReactNode }) {
  return <code className="rounded border border-border bg-surface-hover px-1.5 py-0.5 font-mono text-[12px] text-foreground">{children}</code>;
}

function CodeBlock({ label, children }: { label: string; children: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-hover">
      <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted">{label}</span>
        <CopyButton value={children} label={label} />
      </div>
      <pre className="overflow-x-auto px-4 py-3 text-xs leading-relaxed">
        <code className="font-mono text-foreground">{children}</code>
      </pre>
    </div>
  );
}

const CALLOUT_STYLE = {
  info: { box: "border-border bg-surface-hover", icon: "text-accent" },
  success: { box: "border-success/25 bg-success/[0.06]", icon: "text-success" },
  warning: { box: "border-warning/25 bg-warning/[0.06]", icon: "text-warning" },
  danger: { box: "border-danger/25 bg-danger/[0.06]", icon: "text-danger" },
} as const;
const CALLOUT_ICON: Record<keyof typeof CALLOUT_STYLE, LucideIcon> = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: AlertTriangle };

function Callout({ tone = "info", title, children }: { tone?: keyof typeof CALLOUT_STYLE; title: string; children: ReactNode }) {
  const Icon = CALLOUT_ICON[tone];
  const style = CALLOUT_STYLE[tone];
  return (
    <div className={cn("rounded-xl border p-4", style.box)}>
      <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
        <Icon className={cn("h-4 w-4 shrink-0", style.icon)} strokeWidth={1.75} />
        {title}
      </div>
      <div className="text-sm leading-relaxed text-muted">{children}</div>
    </div>
  );
}

function BulletGrid({ items }: { items: ReactNode[] }) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2.5 rounded-lg border border-border bg-surface-hover px-3.5 py-2.5 text-sm leading-relaxed">
          <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={2} />
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}

function EnvTable({ rows }: { rows: Array<{ name: string; app: string; purpose: ReactNode }> }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-border bg-surface-hover text-xs text-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">Variable</th>
              <th className="px-4 py-2.5 font-medium">App</th>
              <th className="px-4 py-2.5 font-medium">Purpose</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.name}>
                <td className="px-4 py-2.5 align-top font-mono text-xs">{r.name}</td>
                <td className="px-4 py-2.5 align-top text-xs text-muted">{r.app}</td>
                <td className="px-4 py-2.5 align-top text-xs leading-relaxed text-muted">{r.purpose}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// content
// ---------------------------------------------------------------------------

interface DocSection {
  id: string;
  label: string;
  group: string;
  icon: LucideIcon;
  title: string;
  description: string;
  body: ReactNode;
}

const sections: DocSection[] = [
  {
    id: "overview",
    label: "Overview",
    group: "Get started",
    icon: Sparkles,
    title: "What Deplyr does",
    description: "Code on GitHub to live on your own server, with a database, logs, monitoring and alerts.",
    body: (
      <>
        <p>
          Deplyr is an open-source, self-hostable platform. You point it at a VPS you own — an EC2 instance, a
          Hetzner box, anything running Linux — and it installs what it needs over SSH once. From then on you deploy
          apps from GitHub, spin up Postgres or Redis, watch health and logs, and get told in Discord or Slack when
          something breaks.
        </p>
        <p>Two different servers are involved — worth keeping straight from the start:</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface-hover p-4">
            <p className="text-sm font-semibold">The control plane</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Deplyr itself — this web app, its API and a background worker. You run it once, on your own box.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface-hover p-4">
            <p className="text-sm font-semibold">A managed server</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              A VPS you register <em>through</em> Deplyr to run your apps on. It dials out to the control plane and stays
              connected, so it never needs an open inbound management port.
            </p>
          </div>
        </div>
        <BulletGrid
          items={[
            "Register a server and deploy Next.js, NestJS, plain Node, or anything with a Dockerfile.",
            "Free <name>.<your-domain> address for every project, or bring your own with automatic Let's Encrypt SSL.",
            "PostgreSQL and Redis on any server, private by default, with health and history charts.",
            "Discord and Slack alerts for downtime, deploys and offline servers, with full delivery history.",
            "A full activity log of every action across every server and project.",
            "Everything sensitive — tokens, credentials, secrets, passwords — encrypted at rest.",
          ]}
        />
      </>
    ),
  },
  {
    id: "self-hosting",
    label: "Self-hosting",
    group: "Get started",
    icon: Server,
    title: "Self-hosting the control plane",
    description: "One command on a fresh VPS — no manual Docker install, no hand-written .env.",
    body: (
      <>
        <p>
          Provision a small VPS (a t3.small or larger, Ubuntu 22.04+), then run this on it as root:
        </p>
        <CodeBlock label="bash">{`curl -fsSL https://raw.githubusercontent.com/deplyr/deplyr/main/infra/install.sh | bash`}</CodeBlock>
        <p>
          It installs Docker if it's missing, clones the repo, generates <InlineCode>DEPLYR_MASTER_KEY</InlineCode> and
          every other secret, detects the box's public IP, and brings the whole stack up — Postgres, Redis, the API,
          the worker, the dashboard and Caddy. Open the URL it prints; first visit walks you through creating the
          admin account.
        </p>
        <Callout tone="success" title="Also how you update or redeploy later">
          Run the exact same command again on the same box whenever a new version ships, or you just want to redeploy.
          It pulls the latest code and rebuilds — your existing <InlineCode>.env</InlineCode> (and{" "}
          <InlineCode>DEPLYR_MASTER_KEY</InlineCode>) is left untouched, so nothing already encrypted breaks.
        </Callout>
        <p>
          Want a real domain instead of the bare IP it auto-detects, or GitHub OAuth set up front? Export the matching
          variable before piping it in:
        </p>
        <CodeBlock label="bash">{`DEPLYR_PUBLIC_HOST=deplyr.example.com \\
GITHUB_CLIENT_ID=… GITHUB_CLIENT_SECRET=… \\
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/deplyr/deplyr/main/infra/install.sh)"`}</CodeBlock>
        <p>
          Point the domain's DNS A record at the box first if you use one. Allow inbound <InlineCode>80</InlineCode>{" "}
          (the dashboard, and the HTTPS challenge on a domain), <InlineCode>443</InlineCode> (HTTPS, domain only) and{" "}
          <InlineCode>4000</InlineCode> (the API — the browser talks to it, and managed-server agents dial back to it).
        </p>
        <Callout tone="info" title="Registering managed servers happens afterwards, inside the UI">
          The command above only stands up the control plane. Add the VPS you actually want to deploy apps to from{" "}
          <strong className="text-foreground">Servers → Connect server</strong> once you're logged in — including,
          if you want, this same box (see the callout on that below).
        </Callout>
      </>
    ),
  },
  {
    id: "github",
    label: "Connecting GitHub",
    group: "Get started",
    icon: Github,
    title: "Connecting GitHub",
    description: "Deplyr needs read access to the repos you want to deploy.",
    body: (
      <>
        <p>There are two ways to connect it — pick whichever fits your setup:</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface-hover p-4">
            <p className="text-sm font-semibold">OAuth app</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              One-click "Continue with GitHub" for every user. Create an OAuth App at{" "}
              <InlineCode>github.com/settings/developers</InlineCode>, then set{" "}
              <InlineCode>GITHUB_CLIENT_ID</InlineCode> and <InlineCode>GITHUB_CLIENT_SECRET</InlineCode>. The callback
              URL must match <InlineCode>GITHUB_OAUTH_REDIRECT_URI</InlineCode>. Scopes requested:{" "}
              <InlineCode>read:user user:email repo</InlineCode>.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface-hover p-4">
            <p className="text-sm font-semibold">Personal access token</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              No OAuth app needed — paste a token with the <InlineCode>repo</InlineCode> scope (or a fine-grained token
              with read access to Contents and Metadata) from <strong className="text-foreground">Settings</strong>. The
              easiest option for a private, self-hosted instance.
            </p>
          </div>
        </div>
        <Callout tone="info" title="A dead token logs you out">
          If a linked GitHub token is revoked or expires, Deplyr detects the 401 the next time it's used, clears the
          link, and ends the session rather than failing silently. Reconnect from Settings.
        </Callout>
      </>
    ),
  },
  {
    id: "servers",
    label: "Servers",
    group: "Using Deplyr",
    icon: Cpu,
    title: "Registering a server",
    description: "Point Deplyr at a Linux box and it does the rest.",
    body: (
      <>
        <p>
          From <strong className="text-foreground">Servers → Connect server</strong>, give it a name, an IP address, and
          either a root password or an SSH private key. Deplyr connects once over SSH and installs Docker, nginx and a
          small agent — after that it never needs SSH again. The agent dials <strong className="text-foreground">out</strong>{" "}
          to the control plane and stays connected, so the server needs no open inbound management port.
        </p>
        <p>
          Once connected you get live CPU, memory, disk and load, with history charts from 1 hour to 7 days, and a
          warning if the agent's heartbeat goes stale.
        </p>
        <Callout tone="warning" title="Docker Desktop on a Mac doesn't work as a managed server">
          Docker Desktop doesn't expose host networking, which deployed apps rely on. Use a real Linux server or VM.
        </Callout>
      </>
    ),
  },
  {
    id: "deploying",
    label: "Deploying a project",
    group: "Using Deplyr",
    icon: Rocket,
    title: "Deploying a project",
    description: "From a GitHub repo to a running container, with sensible defaults you can override.",
    body: (
      <>
        <p>
          <strong className="text-foreground">Projects → New project</strong> picks a server and a repo, then Deplyr
          detects the framework — <strong className="text-foreground">Next.js, NestJS, plain Node</strong>, or anything
          with a <strong className="text-foreground">Dockerfile</strong> — along with the package manager (npm, pnpm,
          yarn, bun), the Node version, and monorepo subfolders. Everything it detects is editable afterwards on the
          project's Settings tab: install, build and start commands, the root folder, and the health-check path.
        </p>
        <BulletGrid
          items={[
            "Secrets are encrypted at rest, available at both build and run time.",
            "Secrets are never written into your source tree or a Docker image layer.",
            "Every deploy shows step-by-step progress with per-step logs.",
            "A failed deploy can be retried — fix the setting, hit Deploy again.",
          ]}
        />
      </>
    ),
  },
  {
    id: "databases",
    label: "Databases",
    group: "Using Deplyr",
    icon: Database,
    title: "Databases",
    description: "PostgreSQL and Redis, one click, private by default.",
    body: (
      <>
        <p>
          From a server's <strong className="text-foreground">Databases</strong> tab, create a Postgres or Redis
          instance: choose the version, port, memory limit, and — for Redis — an eviction policy and persistence mode.
        </p>
        <p>
          Databases bind to the server's loopback address, reachable only by apps running on that same server.
          Credentials are never shown by default — reveal them on demand from the database's page, or connect an app to
          one directly when creating it.
        </p>
        <p>Each database gets its own health status, live stats (connections and cache ratio for Postgres; hit rate and memory for Redis), history charts, and container logs.</p>
      </>
    ),
  },
  {
    id: "domains",
    label: "Domains & SSL",
    group: "Using Deplyr",
    icon: Globe,
    title: "Domains & SSL",
    description: "A free address for every project, or bring your own with automatic HTTPS.",
    body: (
      <>
        <p>
          Every project gets a free <InlineCode>&lt;name&gt;.&lt;your-domain&gt;</InlineCode> address the moment it
          deploys. Add your own domain from the project's <strong className="text-foreground">Domains</strong> tab and
          Deplyr shows you the DNS record to create, verifies it automatically once it propagates, and issues a real
          Let's Encrypt certificate — no wildcard certificate needed for custom domains, and it renews itself from then
          on.
        </p>
        <Callout tone="info" title="The free default address needs a wildcard certificate for HTTPS">
          Without one configured on the control plane (<InlineCode>DEPLYR_WILDCARD_CERT_PEM</InlineCode> /{" "}
          <InlineCode>_KEY_PEM</InlineCode>), the free <InlineCode>*.your-domain</InlineCode> addresses serve over HTTP
          only. Custom domains always get a real certificate automatically, independent of this.
        </Callout>
      </>
    ),
  },
  {
    id: "notifications",
    label: "Notifications & Activity",
    group: "Using Deplyr",
    icon: Bell,
    title: "Notifications & Activity",
    description: "Know the moment something breaks, and see everything that's happened.",
    body: (
      <>
        <p>
          Add a channel from <strong className="text-foreground">Notifications</strong> in the sidebar. You'll need a
          webhook URL:
        </p>
        <BulletGrid
          items={[
            <>Discord: <em>Channel settings → Integrations → Webhooks → New Webhook</em>.</>,
            <>Slack: an app with <em>Incoming Webhooks</em> enabled.</>,
          ]}
        />
        <p>
          Deplyr sends a test message before it saves the channel, so a broken webhook is caught immediately —
          editing a channel's webhook later works the same way. Every attempted delivery, including failures and why,
          shows up in the channel's history.
        </p>
        <p>
          Separately, the <strong className="text-foreground">Activity</strong> page logs every action across every
          server and project — deploys, database changes, installs, agent connects, secret changes, alerts — filterable
          and searchable in one place.
        </p>
      </>
    ),
  },
  {
    id: "environment",
    label: "Environment variables",
    group: "Reference",
    icon: KeyRound,
    title: "Environment variables",
    description: "What the control plane's own configuration knobs do.",
    body: (
      <EnvTable
        rows={[
          { name: "DATABASE_URL, REDIS_URL", app: "api, worker", purpose: "Postgres and Redis connections" },
          { name: "DEPLYR_MASTER_KEY", app: "api, worker", purpose: "32-byte base64 key that encrypts stored secrets — must match on both" },
          { name: "DEPLYR_SESSION_SECRET", app: "api", purpose: "Signs login sessions" },
          { name: "GITHUB_CLIENT_ID / _SECRET / GITHUB_OAUTH_REDIRECT_URI", app: "api", purpose: "Optional GitHub OAuth" },
          { name: "WEB_URL", app: "api, worker", purpose: "Public URL of the web app — CORS, redirects, links in alerts" },
          { name: "DEPLYR_CONTROL_PLANE_WS", app: "worker", purpose: <>Public <InlineCode>ws(s)://…/agent/ws</InlineCode> URL agents dial back to</> },
          { name: "DEPLYR_APP_DOMAIN", app: "worker, web", purpose: <>Base domain for deployed apps (<InlineCode>my-app.&lt;domain&gt;</InlineCode>)</> },
          { name: "DEPLYR_WILDCARD_CERT_PEM / _KEY_PEM", app: "worker", purpose: "Optional wildcard certificate for HTTPS on the free default addresses" },
          { name: "API_URL, NEXT_PUBLIC_API_URL", app: "web", purpose: "Server-side and browser URLs of the API" },
          { name: "DEPLYR_WEB_PORT", app: "caddy", purpose: "Host port for the dashboard — default 80; override if this box also self-hosts apps" },
          { name: "DEPLYR_CLOUD_MODE", app: "api", purpose: "Set true for real, independent sign-ups — skips the self-host \"create the admin account\" wizard" },
        ]}
      />
    ),
  },
  {
    id: "security",
    label: "Security model",
    group: "Reference",
    icon: Lock,
    title: "Security model",
    description: "What's encrypted, what's logged, and what isn't.",
    body: (
      <>
        <BulletGrid
          items={[
            "GitHub tokens, SSH credentials, secret values, database passwords and webhook URLs are all AES-256-GCM encrypted at rest using DEPLYR_MASTER_KEY.",
            "Secret values are never logged — the activity log records which secret was touched, never its value.",
            "Notification webhooks are restricted to Slack's and Discord's real hosts, so a saved URL can't be used to make the server call arbitrary addresses.",
            "Databases bind to 127.0.0.1 on the managed server — never exposed publicly.",
          ]}
        />
        <Callout tone="danger" title="Losing DEPLYR_MASTER_KEY means losing everything it encrypted">
          There's no recovery path for a lost master key — back it up somewhere safe, separate from the database backup.
        </Callout>
        <Callout tone="warning" title="The control plane runs over plain HTTP by default">
          Unless you put a real domain in front of it (Caddy issues HTTPS for you automatically in that case), the
          session cookie and any SSH credentials you paste travel unencrypted. Use a domain, or your own TLS-terminating
          reverse proxy, for anything beyond local testing.
        </Callout>
      </>
    ),
  },
  {
    id: "status",
    label: "Status & limitations",
    group: "Reference",
    icon: ShieldCheck,
    title: "Status & known limitations",
    description: "Deplyr is early alpha — worth knowing before relying on it.",
    body: (
      <BulletGrid
        items={[
          "Not yet validated end-to-end on a real remote Linux server — each piece works against real Docker and GitHub, but the full path through nginx, SSL and the post-deploy health check on a fresh VPS is the current milestone.",
          "The agent image needs publishing (infra/publish-agent.sh) before first use, and after any change to the agent itself.",
          "Databases are private-only — no public exposure or firewall management yet; connect from your machine over an SSH tunnel.",
          "Your app must listen on $PORT — Deplyr assigns the port and sets it for you.",
          "An existing managed server needs its agent updated when the agent's own commands change.",
        ]}
      />
    ),
  },
];

const groups = Array.from(new Set(sections.map((s) => s.group)));

export default function DocsPage() {
  return (
    <Page>
      <PageHeader
        eyebrow="Reference"
        title="Documentation"
        description="How Deplyr works, how to self-host it, and how to use everything in it."
      />

      <div className="grid gap-8 xl:grid-cols-[240px_1fr]">
        {/* Table of contents */}
        <aside className="hidden xl:block">
          <nav
            aria-label="Documentation sections"
            className="sticky top-[4.25rem] max-h-[calc(100vh-6rem)] overflow-y-auto rounded-xl border border-border bg-surface p-5 shadow-sm"
          >
            <div className="space-y-6">
              {groups.map((group) => (
                <div key={group}>
                  <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-muted">{group}</p>
                  <div className="flex flex-col gap-0.5">
                    {sections
                      .filter((s) => s.group === group)
                      .map((s) => (
                        <a
                          key={s.id}
                          href={`#${s.id}`}
                          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-surface-hover hover:text-foreground"
                        >
                          <s.icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                          <span className="truncate">{s.label}</span>
                        </a>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </nav>
        </aside>

        {/* Content */}
        <div className="max-w-3xl space-y-6">
          {sections.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-[5.5rem] rounded-xl border border-border bg-surface p-6 sm:p-8">
              <div className="mb-5 flex items-start gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <s.icon className="h-5 w-5" strokeWidth={1.5} />
                </span>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold tracking-tight">{s.title}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{s.description}</p>
                </div>
              </div>
              <div className="space-y-4 text-sm leading-relaxed">{s.body}</div>
            </section>
          ))}
        </div>
      </div>
    </Page>
  );
}
