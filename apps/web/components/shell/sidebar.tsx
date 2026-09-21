"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Server, Bell, Settings, LogOut } from "lucide-react";
import type { AuthUser } from "@deplyr/shared-types";
import { cn } from "@/lib/cn";

// Servers are the top-level thing — projects, databases and domains live
// inside them, so they don't get a sidebar entry of their own.
const navItems = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/servers", label: "Servers", icon: Server },
  { href: "/notifications", label: "Notifications", icon: Bell },
] as const;

const accountItems = [{ href: "/settings", label: "Settings", icon: Settings }] as const;

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof Server;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
        active
          ? "bg-white/[0.06] font-medium text-foreground"
          : "text-muted hover:bg-white/[0.04] hover:text-foreground",
      )}
    >
      {active ? (
        <span className="absolute -left-3 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-accent" />
      ) : null}
      <Icon className={cn("h-4 w-4", active && "text-accent")} strokeWidth={1.75} />
      {label}
    </Link>
  );
}

export function Sidebar({ user }: { user: AuthUser | null }) {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  async function handleLogout() {
    await fetch(`${API_URL}/auth/logout`, { method: "POST", credentials: "include" });
    router.push("/login");
    router.refresh();
  }

  const label = user?.githubLogin ?? user?.email ?? "";
  const initial = label.charAt(0).toUpperCase() || "?";

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-white/[0.07] bg-black/30 px-3 py-4 backdrop-blur-xl">
      <div className="mb-7 flex items-center gap-2.5 px-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-foreground shadow-lg shadow-accent/25">
          D
        </div>
        <span className="font-mono text-base font-semibold tracking-tight">deplyr</span>
      </div>

      <p className="mb-2 px-3 font-mono text-[10px] uppercase tracking-widest text-muted/70">
        Workspace
      </p>
      <nav className="flex flex-col gap-0.5 pl-3">
        {navItems.map((item) => (
          <NavLink key={item.href} {...item} active={isActive(item.href)} />
        ))}
      </nav>

      <p className="mb-2 mt-7 px-3 font-mono text-[10px] uppercase tracking-widest text-muted/70">
        Account
      </p>
      <nav className="flex flex-col gap-0.5 pl-3">
        {accountItems.map((item) => (
          <NavLink key={item.href} {...item} active={isActive(item.href)} />
        ))}
      </nav>

      {user ? (
        <div className="mt-auto flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 font-mono text-sm font-semibold text-accent">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{label}</p>
            <p className="truncate text-[11px] text-muted">{user.email}</p>
          </div>
          <button
            onClick={handleLogout}
            title="Log out"
            className="shrink-0 rounded-md p-1.5 text-muted transition hover:bg-white/[0.06] hover:text-foreground"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
      ) : null}
    </aside>
  );
}
