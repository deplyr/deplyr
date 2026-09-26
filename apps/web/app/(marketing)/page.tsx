import type { Metadata } from "next";
import Link from "next/link";
import {
  Bell,
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
import { GITHUB_URL, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/site";

const INSTALL_CMD = "curl -fsSL https://raw.githubusercontent.com/deplyr/deplyr/main/infra/install.sh | bash";

const FEATURES: Array<{ icon: LucideIcon; title: string; body: string }> = [
  { icon: ServerIcon, title: "Any Linux VPS", body: "Register a box with an IP and root password or SSH key — Deplyr installs Docker, nginx and a small agent for you." },
  { icon: Rocket, title: "Deploy from GitHub", body: "Next.js, NestJS, plain Node, or anything with a Dockerfile. Framework, package manager and monorepo path are all auto-detected and editable." },
  { icon: Database, title: "Postgres & Redis", body: "One click to create a database on any server — private by default, with health, stats and history charts." },
  { icon: Globe, title: "Domains & free SSL", body: "Every project gets a free address. Add your own domain and Deplyr verifies the DNS and issues a Let's Encrypt certificate automatically." },
  { icon: Bell, title: "Discord & Slack alerts", body: "Get told when an app goes down, a deploy finishes or a server drops off — with a full delivery history, including failures." },
  { icon: Lock, title: "Encrypted at rest", body: "GitHub tokens, SSH credentials, secret values and database passwords are all AES-256-GCM encrypted, never logged in plain text." },
];

export const metadata: Metadata = {
  title: { absolute: SITE_TITLE },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { url: SITE_URL, title: SITE_TITLE, description: SITE_DESCRIPTION, type: "website", images: ["/opengraph-image"] },
};

// Structured data so search engines can show this as a software product, and
// tie the site to its repository.
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#software`,
      name: SITE_NAME,
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Linux",
      license: "https://opensource.org/licenses/MIT",
      codeRepository: GITHUB_URL,
      sameAs: [GITHUB_URL],
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
    { "@type": "WebSite", "@id": `${SITE_URL}/#website`, name: SITE_NAME, url: SITE_URL, description: SITE_DESCRIPTION },
  ],
};

export default function LandingPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      {/* hero — the ambient glow/grid behind this now lives in the marketing
          layout (MarketingBackground), fixed to the viewport so it shows
          behind the floating header too, not just this section. */}
      <section className="border-b border-border">
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
              href="/docs#self-hosting"
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
          <p className="mt-4 text-xs text-muted">MIT licensed. Self-host it in minutes — see the <Link href="/docs#self-hosting" className="text-accent hover:underline">documentation</Link>.</p>
        </div>
      </section>

      {/* how it works */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">How it works</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">One VPS is all it takes</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Deplyr itself and the apps it deploys are two <em>roles</em>, not two boxes — the same VPS you install
            Deplyr on can run your apps too. Add more servers later, whenever you actually want to, and manage all of
            them from this one instance.
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

          <div className="flex items-center justify-center gap-2 py-4 text-center text-muted lg:flex-col lg:py-0">
            <Radio className="h-4 w-4 shrink-0 animate-pulse text-accent" strokeWidth={1.75} />
            <span className="text-[11px] font-medium uppercase tracking-widest">WebSocket, always out</span>
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
        <p className="mx-auto mt-6 max-w-lg text-center text-xs text-muted">
          These can be the exact same VPS — register the box Deplyr runs on as its own managed server and deploy right
          there. A second box is only for when you outgrow the first one.
        </p>
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
              Provision a small VPS and run one command. It installs Docker if it's missing, generates every secret,
              and brings up Postgres, Redis, the API, the worker and the dashboard — no config file to write by hand.
            </p>
            <div className="mt-5 space-y-2">
              {["Runs entirely on infrastructure you control", "No telemetry, no vendor lock-in", "MIT licensed, fork it freely"].map((line) => (
                <div key={line} className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 shrink-0 text-success" strokeWidth={2.5} />
                  {line}
                </div>
              ))}
            </div>
            <Link href="/docs#self-hosting" className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
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
              href="/docs#self-hosting"
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
        </div>
      </section>
    </>
  );
}
