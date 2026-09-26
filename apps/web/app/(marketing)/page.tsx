import Link from "next/link";
import {
  Bell,
  Boxes,
  Check,
  Database,
  Github,
  Globe,
  LayoutDashboard,
  Lock,
  Radio,
  Rocket,
  Server as ServerIcon,
  ShieldCheck,
  Sparkles,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import { CopyButton } from "@/components/ui/copy-button";

const GITHUB_URL = "https://github.com/deplyr/deplyr";
const INSTALL_CMD = "docker compose -f infra/docker/docker-compose.prod.yml --env-file .env up -d --build";

const FEATURES: Array<{ icon: LucideIcon; title: string; body: string }> = [
  { icon: ServerIcon, title: "Any Linux VPS", body: "Register a box with an IP and root password or SSH key — Deplyr installs Docker, nginx and a small agent for you." },
  { icon: Rocket, title: "Deploy from GitHub", body: "Next.js, NestJS, plain Node, or anything with a Dockerfile. Framework, package manager and monorepo path are all auto-detected and editable." },
  { icon: Database, title: "Postgres & Redis", body: "One click to create a database on any server — private by default, with health, stats and history charts." },
  { icon: Globe, title: "Domains & free SSL", body: "Every project gets a free address. Add your own domain and Deplyr verifies the DNS and issues a Let's Encrypt certificate automatically." },
  { icon: Bell, title: "Discord & Slack alerts", body: "Get told when an app goes down, a deploy finishes or a server drops off — with a full delivery history, including failures." },
  { icon: Lock, title: "Encrypted at rest", body: "GitHub tokens, SSH credentials, secret values and database passwords are all AES-256-GCM encrypted, never logged in plain text." },
];

export default function LandingPage() {
  return (
    <>
      {/* hero */}
      <section className="relative isolate overflow-hidden border-b border-border">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-accent/20 blur-[140px]" />
          <div className="absolute -bottom-52 right-[-8rem] h-[36rem] w-[36rem] rounded-full bg-accent/10 blur-[150px]" />
          <div
            className="absolute inset-0 opacity-[0.5] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]"
            style={{
              backgroundImage:
                "linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border)) 1px, transparent 1px)",
              backgroundSize: "44px 44px",
            }}
          />
        </div>

        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-8 sm:py-28">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-accent" strokeWidth={1.75} />
            Open source · self-hosted
          </span>

          <h1 className="mt-6 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">
            From GitHub repo to
            <span className="block text-accent">live on your own server.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
            Deplyr takes a VPS you already own and turns it into your own deploy platform — apps, databases, domains
            with SSL, monitoring and alerts. No nginx, no SSH, no vendor lock-in.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground shadow-lg shadow-accent/20 transition hover:brightness-110"
            >
              <Rocket className="h-4 w-4" strokeWidth={1.75} />
              Get started
            </Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              <Github className="h-4 w-4" strokeWidth={1.75} />
              View on GitHub
            </a>
          </div>
          <p className="mt-4 text-xs text-muted">MIT licensed. Self-host it in minutes — see the <Link href="/docs" className="text-accent hover:underline">documentation</Link>.</p>
        </div>
      </section>

      {/* how it works */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">How it works</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Two servers, never mixed up</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            The control plane is Deplyr itself, run once on your own box. Managed servers are the VPS instances you
            register through it to actually run your apps.
          </p>
        </div>

        <div className="mt-10 grid items-center gap-4 lg:grid-cols-[1fr_auto_1fr]">
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <LayoutDashboard className="h-5 w-5" strokeWidth={1.5} />
            </span>
            <h3 className="mt-4 text-base font-semibold">The control plane</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              The web app, its API and a background worker — this repo. You run it once, on your own box.
            </p>
          </div>

          <div className="flex items-center justify-center gap-2 py-4 text-muted lg:flex-col lg:py-0">
            <Radio className="h-4 w-4 shrink-0 animate-pulse text-accent" strokeWidth={1.75} />
            <span className="whitespace-nowrap text-[11px] font-medium uppercase tracking-widest">WebSocket, always out</span>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <ServerIcon className="h-5 w-5" strokeWidth={1.5} />
            </span>
            <h3 className="mt-4 text-base font-semibold">A managed server</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              Any Linux VPS, registered through Deplyr. Its agent dials <strong className="text-foreground">out</strong>{" "}
              and stays connected — no open inbound port needed.
            </p>
          </div>
        </div>
      </section>

      {/* features */}
      <section className="border-t border-border bg-surface-hover/40">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-8 sm:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-accent">Everything included</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">One dashboard for the whole stack</h2>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <f.icon className="h-5 w-5" strokeWidth={1.5} />
                </span>
                <h3 className="mt-4 text-sm font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* install */}
      <section className="mx-auto max-w-4xl px-4 py-16 sm:px-8 sm:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-accent">Self-host it</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Up and running in one command</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Provision a small VPS, clone the repo, set a few environment variables, and bring the whole control
              plane up with Docker Compose — Postgres, Redis, the API, the worker and the dashboard, all in one shot.
            </p>
            <div className="mt-5 space-y-2">
              {["Runs entirely on infrastructure you control", "No telemetry, no vendor lock-in", "MIT licensed, fork it freely"].map((line) => (
                <div key={line} className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 shrink-0 text-success" strokeWidth={2.5} />
                  {line}
                </div>
              ))}
            </div>
            <Link href="/docs" className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
              Read the full self-hosting guide →
            </Link>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-surface-hover">
            <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-2">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted">
                <Terminal className="h-3 w-3" strokeWidth={1.75} />
                bash
              </span>
              <CopyButton value={INSTALL_CMD} label="install command" />
            </div>
            <pre className="overflow-x-auto px-4 py-4 text-xs leading-relaxed">
              <code className="font-mono text-foreground">{INSTALL_CMD}</code>
            </pre>
          </div>
        </div>
      </section>

      {/* final CTA */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-8 sm:py-20">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent mx-auto">
            <ShieldCheck className="h-6 w-6" strokeWidth={1.5} />
          </span>
          <h2 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">Own your deploys, own your data.</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted">
            No usage-based pricing, no black box. Deplyr runs on hardware you already pay for.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground shadow-lg shadow-accent/20 transition hover:brightness-110"
            >
              <Rocket className="h-4 w-4" strokeWidth={1.75} />
              Get started
            </Link>
            <Link
              href="/docs"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-5 py-3 text-sm font-semibold transition hover:bg-surface-hover"
            >
              <Boxes className="h-4 w-4" strokeWidth={1.75} />
              Read the docs
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
