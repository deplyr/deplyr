"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createContext, useContext, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * True inside a layout that already provides the page frame (container,
 * gutters, a header of its own, tabs). Pages rendered there — which are also
 * routable on their own — then skip their frame and back link instead of
 * doubling up.
 */
export const NestedPageContext = createContext(false);

/** Standard page frame: width, gutters and the entrance animation. */
export function Page({
  width = "wide",
  children,
}: {
  width?: "wide" | "narrow" | "form";
  children: ReactNode;
}) {
  const nested = useContext(NestedPageContext);
  if (nested) return <div className="space-y-6">{children}</div>;
  return (
    <div
      className={cn(
        "mx-auto space-y-6 px-4 py-6 sm:px-8 sm:py-8",
        width === "wide" && "max-w-6xl",
        width === "narrow" && "max-w-4xl",
        width === "form" && "max-w-5xl",
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  back,
}: {
  eyebrow?: string;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  const nested = useContext(NestedPageContext);
  if (nested && !title && !eyebrow && !actions) return null;
  return (
    <header className="animate-fade-up">
      {back && !nested ? (
        <Link
          href={back.href}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
          {back.label}
        </Link>
      ) : null}
      {title || eyebrow || actions ? (
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="font-mono text-xs uppercase tracking-widest text-accent">{eyebrow}</p>
          ) : null}
          {title ? <h1 className="mt-1.5 font-mono text-2xl font-semibold tracking-tight">{title}</h1> : null}
          {description ? (
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
      </div>
      ) : null}
    </header>
  );
}
