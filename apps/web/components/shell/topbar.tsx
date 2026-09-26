"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Menu, Search } from "lucide-react";
import { NotificationsBell } from "@/components/shell/notifications-bell";

const SEGMENT_LABELS: Record<string, string> = {
  projects: "Projects",
  servers: "Servers",
  settings: "Settings",
  new: "New",
  databases: "Databases",
  activity: "Activity",
  logs: "Logs",
  deployments: "Deployments",
  deploys: "Deployments",
  secrets: "Environment",
  notifications: "Notifications",
  docs: "Documentation",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;

// Path segments that group children but have no page of their own.
const NO_PAGE = new Set<string>(["deploys"]);

function crumbs(pathname: string): Array<{ label: string; href: string | null }> {
  // "dashboard" is the app's root alias (see middleware.ts — "/" is the
  // public landing page) — drop it as a leading segment so it doesn't show
  // up as a second "Overview"-ish crumb next to the seed below.
  const segments = pathname.split("/").filter(Boolean).filter((seg, i) => !(i === 0 && seg === "dashboard"));
  const out: Array<{ label: string; href: string | null }> = [{ label: "Overview", href: "/dashboard" }];
  let href = "";
  for (const seg of segments) {
    href += `/${seg}`;
    out.push({ label: SEGMENT_LABELS[seg] ?? (UUID.test(seg) ? "Details" : seg), href: NO_PAGE.has(seg) ? null : href });
  }
  return out;
}

export function Topbar({
  onOpenMenu,
  onOpenSearch,
}: {
  onOpenMenu: () => void;
  onOpenSearch: () => void;
}) {
  const pathname = usePathname();
  const trail = crumbs(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-xl sm:px-8">
      <button
        onClick={onOpenMenu}
        aria-label="Open menu"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted transition hover:bg-surface-hover hover:text-foreground lg:hidden"
      >
        <Menu className="h-4 w-4" strokeWidth={1.75} />
      </button>

      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
        {trail.map((c, i) => {
          const last = i === trail.length - 1;
          return (
            <span key={c.href ?? c.label} className="flex min-w-0 items-center gap-1.5">
              {i > 0 ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted/50" strokeWidth={1.75} /> : null}
              {last || c.href === null ? (
                <span className={last ? "truncate font-medium" : "truncate text-muted"}>{c.label}</span>
              ) : (
                <Link href={c.href} className="truncate text-muted transition hover:text-foreground">
                  {c.label}
                </Link>
              )}
            </span>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-2.5">
        <button
          onClick={onOpenSearch}
          className="hidden h-9 w-64 items-center gap-2.5 rounded-lg border border-border bg-surface-hover px-3 text-sm text-muted transition hover:bg-surface sm:flex"
        >
          <Search className="h-4 w-4" strokeWidth={1.75} />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
        </button>
        <button
          onClick={onOpenSearch}
          aria-label="Search"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-hover text-muted sm:hidden"
        >
          <Search className="h-4 w-4" strokeWidth={1.75} />
        </button>
        <NotificationsBell />
      </div>
    </header>
  );
}
