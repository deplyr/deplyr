"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, ListChecks, Server, Bell, BookOpen, Settings, LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { AuthUser } from "@deplyr/shared-types";
import { cn } from "@/lib/cn";
import { useSidebar } from "@/components/shell/sidebar-context";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Servers are the top-level thing — projects, databases and domains live
// inside them, so they don't get a sidebar entry of their own.
const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/servers", label: "Servers", icon: Server },
  { href: "/activity", label: "Activity", icon: ListChecks },
  { href: "/notifications", label: "Notifications", icon: Bell },
] as const;

const accountItems = [
  { href: "/docs", label: "Documentation", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
}: {
  href: string;
  label: string;
  icon: typeof Server;
  active: boolean;
  collapsed: boolean;
}) {
  const link = (
    <Link
      href={href}
      aria-label={collapsed ? label : undefined}
      className={cn(
        "relative flex items-center gap-2.5 rounded-lg py-2 text-sm transition-colors",
        collapsed ? "justify-center px-0" : "px-3",
        active ? "bg-sidebar-accent font-medium text-foreground" : "text-muted hover:bg-sidebar-accent hover:text-foreground",
      )}
    >
      {active ? (
        <span className={cn("absolute top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-accent", collapsed ? "left-0" : "-left-3")} />
      ) : null}
      <Icon className={cn("h-4 w-4 shrink-0", active && "text-accent")} strokeWidth={1.75} />
      {!collapsed ? label : null}
    </Link>
  );

  if (!collapsed) return link;
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function Sidebar({ user }: { user: AuthUser | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const { collapsed, toggle } = useSidebar();

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
    <TooltipProvider>
      <aside
        className={cn(
          "sticky top-0 flex h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-4 transition-[width] duration-200 ease-in-out",
          collapsed ? "w-[4.5rem]" : "w-60",
        )}
      >
        <div className={cn("mb-7 flex items-center gap-2.5", collapsed && "justify-center")}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-foreground">
            D
          </div>
          {!collapsed ? <span className="text-base font-semibold tracking-tight">deplyr</span> : null}
        </div>

        {!collapsed ? <p className="mb-2 px-3 text-[10px] uppercase tracking-widest text-muted/70">Workspace</p> : null}
        <nav className={cn("flex flex-col gap-0.5", !collapsed && "pl-3")}>
          {navItems.map((item) => (
            <NavLink key={item.href} {...item} active={isActive(item.href)} collapsed={collapsed} />
          ))}
        </nav>

        {!collapsed ? <p className="mb-2 mt-7 px-3 text-[10px] uppercase tracking-widest text-muted/70">Account</p> : <div className="mt-7" />}
        <nav className={cn("flex flex-col gap-0.5", !collapsed && "pl-3")}>
          {accountItems.map((item) => (
            <NavLink key={item.href} {...item} active={isActive(item.href)} collapsed={collapsed} />
          ))}
        </nav>

        <div className={cn("mt-auto flex items-center gap-2 pt-4", collapsed && "flex-col")}>
          <ThemeToggle className={collapsed ? "" : "flex-1"} />
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <button
                onClick={toggle}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted transition hover:bg-surface-hover hover:text-foreground"
              >
                {collapsed ? <PanelLeftOpen className="h-4 w-4" strokeWidth={1.75} /> : <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} />}
              </button>
            </TooltipTrigger>
            <TooltipContent side={collapsed ? "right" : "top"}>{collapsed ? "Expand" : "Collapse"} (⌘B)</TooltipContent>
          </Tooltip>
        </div>

        {user ? (
          collapsed ? (
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <button
                  onClick={handleLogout}
                  aria-label={`Log out (${label})`}
                  className="mx-auto mt-3 flex h-9 w-9 items-center justify-center rounded-full bg-accent/15 text-sm font-semibold text-accent"
                >
                  {initial}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{label} — log out</TooltipContent>
            </Tooltip>
          ) : (
            <div className="mt-3 flex items-center gap-3 rounded-xl border border-border bg-surface-hover p-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-semibold text-accent">
                {initial}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{label}</p>
                <p className="truncate text-[11px] text-muted">{user.email}</p>
              </div>
              <button
                onClick={handleLogout}
                title="Log out"
                className="shrink-0 rounded-md p-1.5 text-muted transition hover:bg-surface hover:text-foreground"
              >
                <LogOut className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
          )
        ) : null}
      </aside>
    </TooltipProvider>
  );
}
