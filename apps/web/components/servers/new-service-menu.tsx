"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Boxes, ChevronDown, Database, Globe, Plus, type LucideIcon } from "lucide-react";
import { CreateDatabaseDialog } from "@/components/databases/create-database-dialog";
import { cn } from "@/lib/cn";

interface Item {
  icon: LucideIcon;
  label: string;
  description: string;
  href?: string;
  onSelect?: () => void;
  soon?: boolean;
}

/**
 * "Add something to this server". A server hosts more than one kind of thing
 * — apps, databases, and soon domains — so the header offers a choice rather
 * than a single hard-wired action.
 */
export function NewServiceMenu({ serverId, databaseCount }: { serverId: string; databaseCount: number }) {
  const [open, setOpen] = useState(false);
  const [dbDialog, setDbDialog] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items: Item[] = [
    {
      icon: Boxes,
      label: "Project",
      description: "Deploy a frontend or backend from GitHub",
      href: `/projects/new?server=${serverId}`,
    },
    {
      icon: Database,
      label: "Database",
      description: "PostgreSQL or Redis on this server",
      onSelect: () => setDbDialog(true),
    },
    {
      icon: Globe,
      label: "Domain",
      description: "Custom domain with SSL",
      soon: true,
    },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground shadow-lg shadow-accent/20 transition hover:brightness-110 active:scale-[0.99]"
      >
        <Plus className="h-4 w-4" strokeWidth={2} />
        New
        <ChevronDown className={cn("h-4 w-4 transition", open && "rotate-180")} strokeWidth={2} />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-12 z-40 w-72 max-w-[calc(100vw-2rem)] animate-fade-up rounded-xl border border-border bg-surface p-1.5 shadow-xl"
        >
          {items.map(({ icon: Icon, label, description, href, onSelect, soon }) => {
            const body = (
              <>
                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", soon ? "bg-surface-hover text-muted" : "bg-accent/10 text-accent")}>
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {label}
                    {soon ? <span className="rounded-full bg-surface-hover px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-muted">Soon</span> : null}
                  </span>
                  <span className="block text-xs leading-snug text-muted">{description}</span>
                </span>
              </>
            );
            const cls = cn("flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 transition", soon ? "cursor-not-allowed opacity-60" : "hover:bg-surface-hover");

            if (soon) {
              return (
                <div key={label} role="menuitem" aria-disabled className={cls}>
                  {body}
                </div>
              );
            }
            return href ? (
              <Link key={label} href={href} role="menuitem" onClick={() => setOpen(false)} className={cls}>
                {body}
              </Link>
            ) : (
              <button
                key={label}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onSelect?.();
                }}
                className={cls}
              >
                {body}
              </button>
            );
          })}
        </div>
      ) : null}

      <CreateDatabaseDialog serverId={serverId} existingCount={databaseCount} open={dbDialog} onClose={() => setDbDialog(false)} />
    </div>
  );
}
