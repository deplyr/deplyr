import Link from "next/link";
import { ArrowRight, Github } from "lucide-react";
import type { AuthUser } from "@deplyr/shared-types";
import { DeplyrMark } from "@/components/brand/deplyr-mark";
import { ThemeToggle } from "@/components/shell/theme-toggle";

const GITHUB_URL = "https://github.com/deplyr/deplyr";

/** Shared by the landing page and the public docs — the only two routes
 * reachable without a session (see middleware.ts). Not the authenticated
 * app's Topbar: no breadcrumbs, no search, and it knows about signed-out
 * visitors, which Topbar never has to.
 *
 * A floating rounded bar, not a full-width border-bottom strip — the strip
 * reads as an old-school site chrome; a pill with room to breathe around it
 * is the current shape for this kind of header. */
export function SiteHeader({ user }: { user: AuthUser | null }) {
  // The standalone landing-page deploy has no accounts, so no sign-in button —
  // and with it gone, Docs/GitHub stay visible on phones instead of hiding.
  const marketingOnly = process.env.NEXT_PUBLIC_MARKETING_ONLY === "1";
  return (
    <header className="sticky top-3 z-30 px-3 sm:top-4 sm:px-4">
      <div className="mx-auto flex h-14 max-w-4xl items-center gap-1 rounded-full border border-border bg-surface/80 pl-4 pr-2 shadow-lg shadow-black/[0.03] backdrop-blur-xl sm:gap-2">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <DeplyrMark className="h-7 w-7 shrink-0" idPrefix="site-header-mark" />
          <span className="text-sm font-semibold tracking-tight">Deplyr</span>
        </Link>

        <div className="ml-auto flex items-center gap-1.5">
          <nav className={marketingOnly ? "flex items-center gap-1" : "hidden items-center gap-1 sm:flex"}>
            <Link href="/docs" className="rounded-full px-3.5 py-2 text-sm font-medium text-muted transition hover:bg-surface-hover hover:text-foreground">
              Docs
            </Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black text-white transition hover:bg-zinc-800"
            >
              <Github className="h-4 w-4" strokeWidth={1.75} />
            </a>
          </nav>
          <ThemeToggle className="!h-9 !w-9 rounded-full border-none" />
          {marketingOnly ? null : (
          <Link
            href={user ? "/dashboard" : "/login"}
            className="group inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-accent py-2 pl-4 pr-3 text-sm font-semibold text-accent-foreground transition hover:brightness-110"
          >
            {user ? "Dashboard" : "Sign in"}
            <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" strokeWidth={2} />
          </Link>
          )}
        </div>
      </div>
    </header>
  );
}
