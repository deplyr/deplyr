"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Boxes,
  CornerDownLeft,
  LayoutDashboard,
  Plus,
  Search,
  Server,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { ProjectSummary, ServerSummary } from "@deplyr/shared-types";
import { cn } from "@/lib/cn";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface Item {
  id: string;
  group: "Actions" | "Go to" | "Projects" | "Servers";
  label: string;
  hint?: string;
  href: string;
  icon: LucideIcon;
}

const STATIC_ITEMS: Item[] = [
  { id: "a-new-project", group: "Actions", label: "New project", hint: "Deploy a GitHub repo", href: "/projects/new", icon: Plus },
  { id: "a-new-server", group: "Actions", label: "Connect a server", hint: "Register a VPS", href: "/servers/new", icon: Plus },
  { id: "g-overview", group: "Go to", label: "Overview", href: "/", icon: LayoutDashboard },
  { id: "g-projects", group: "Go to", label: "Projects", href: "/projects", icon: Boxes },
  { id: "g-servers", group: "Go to", label: "Servers", href: "/servers", icon: Server },
  { id: "g-settings", group: "Go to", label: "Settings", href: "/settings", icon: Settings },
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [dynamic, setDynamic] = useState<Item[]>([]);

  // Fresh on every open — cheaper than keeping a client cache in sync.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    setTimeout(() => inputRef.current?.focus(), 20);
    (async () => {
      try {
        const opts = { credentials: "include" as const };
        const [pRes, sRes] = await Promise.all([
          fetch(`${API_URL}/projects`, opts),
          fetch(`${API_URL}/servers`, opts),
        ]);
        const projects: ProjectSummary[] = pRes.ok ? await pRes.json() : [];
        const servers: ServerSummary[] = sRes.ok ? await sRes.json() : [];
        setDynamic([
          ...projects.map<Item>((p) => ({
            id: `p-${p.id}`,
            group: "Projects",
            label: p.name,
            hint: p.githubRepo,
            href: `/projects/${p.id}`,
            icon: Boxes,
          })),
          ...servers.map<Item>((s) => ({
            id: `s-${s.id}`,
            group: "Servers",
            label: s.name,
            hint: s.ipAddress,
            href: `/servers/${s.id}`,
            icon: Server,
          })),
        ]);
      } catch {
        setDynamic([]);
      }
    })();
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = [...dynamic, ...STATIC_ITEMS];
    const filtered = q
      ? all.filter((i) => `${i.label} ${i.hint ?? ""}`.toLowerCase().includes(q))
      : all;
    const order = ["Actions", "Projects", "Servers", "Go to"];
    return filtered.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
  }, [query, dynamic]);

  useEffect(() => setActive(0), [query]);

  function go(item: Item) {
    onClose();
    router.push(item.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      go(results[active]);
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  useEffect(() => {
    document.querySelector(`[data-palette-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[14vh]" onKeyDown={onKeyDown}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-up" onClick={onClose} />
      <div className="relative w-full max-w-xl rounded-2xl bg-gradient-to-b from-white/25 to-white/[0.04] p-px shadow-2xl shadow-black/70 animate-fade-up">
        <div className="overflow-hidden rounded-[calc(1rem-1px)] bg-[#0c0c10]/95 backdrop-blur-xl">
          <div className="flex items-center gap-3 border-b border-white/[0.07] px-4">
            <Search className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects, servers, actions…"
              className="h-14 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted/70 focus:outline-none"
            />
            <kbd className="rounded-md border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-muted">esc</kbd>
          </div>

          <ul className="max-h-[22rem] overflow-y-auto p-2">
            {results.length === 0 ? (
              <li className="px-4 py-10 text-center text-sm text-muted">No results for &ldquo;{query}&rdquo;</li>
            ) : (
              results.map((item, i) => {
                const header = item.group !== lastGroup;
                lastGroup = item.group;
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    {header ? (
                      <p className="px-3 pb-1 pt-3 font-mono text-[10px] uppercase tracking-widest text-muted/70">
                        {item.group}
                      </p>
                    ) : null}
                    <button
                      data-palette-index={i}
                      onMouseMove={() => setActive(i)}
                      onClick={() => go(item)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                        i === active ? "bg-accent/10" : "hover:bg-white/[0.03]",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                          i === active ? "bg-accent/15 text-accent" : "bg-white/[0.05] text-muted",
                        )}
                      >
                        <Icon className="h-4 w-4" strokeWidth={1.75} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{item.label}</span>
                        {item.hint ? (
                          <span className="block truncate font-mono text-[11px] text-muted">{item.hint}</span>
                        ) : null}
                      </span>
                      {i === active ? <CornerDownLeft className="h-3.5 w-3.5 text-accent" strokeWidth={1.75} /> : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          <div className="flex items-center gap-4 border-t border-white/[0.07] px-4 py-2.5 text-[11px] text-muted">
            <span className="flex items-center gap-1.5"><kbd className="font-mono">↑↓</kbd> navigate</span>
            <span className="flex items-center gap-1.5"><kbd className="font-mono">↵</kbd> open</span>
          </div>
        </div>
      </div>
    </div>
  );
}
