import type { ReactNode } from "react";
import { Check, Globe, Database, ShieldCheck, Activity } from "lucide-react";

const steps = [
  { icon: Check, label: "Cloned from GitHub", done: true },
  { icon: Database, label: "Database provisioned", done: true },
  { icon: ShieldCheck, label: "SSL & secrets configured", done: true },
  { icon: Activity, label: "Health check passing", done: false },
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-background">
      {/* ambient glow + grid */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-accent/20 blur-[140px]" />
        <div className="absolute -bottom-52 right-[-8rem] h-[36rem] w-[36rem] rounded-full bg-accent/10 blur-[150px]" />
        <div
          className="absolute inset-0 opacity-[0.5] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
          style={{
            backgroundImage:
              "linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border)) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
      </div>

      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-16 px-6 py-12 lg:grid-cols-2">
        {/* brand / pitch */}
        <div className="hidden lg:block">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-sm font-bold text-background shadow-lg shadow-accent/30">
              D
            </div>
            <span className="text-lg font-semibold tracking-tight">Deplyr</span>
          </div>

          <h2 className="mt-10 text-4xl font-semibold leading-[1.1] tracking-tight">
            From GitHub repo to
            <span className="block text-accent">
              live on the internet.
            </span>
          </h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-muted">
            Database, SSL, monitoring and alerts — without ever touching nginx,
            SSH or an env var.
          </p>

          <div className="mt-10 max-w-sm rounded-2xl border border-border bg-surface p-4 shadow-xl">
            <div className="mb-3 flex items-center gap-2 text-xs text-muted">
              <Globe className="h-3.5 w-3.5" strokeWidth={1.75} />
              my-app.deplyr.app
              <span className="ml-auto flex items-center gap-1.5 text-success">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
                Deploying
              </span>
            </div>
            <ul className="space-y-2.5">
              {steps.map(({ icon: Icon, label, done }) => (
                <li key={label} className="flex items-center gap-3 text-sm">
                  <span
                    className={
                      done
                        ? "flex h-6 w-6 items-center justify-center rounded-full bg-success/15 text-success"
                        : "flex h-6 w-6 items-center justify-center rounded-full border border-border text-muted"
                    }
                  >
                    <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                  </span>
                  <span className={done ? "text-foreground" : "text-muted"}>
                    {label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* form */}
        <div className="flex justify-center lg:justify-end">{children}</div>
      </div>
    </div>
  );
}
