import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Flat panel — solid surface, one hairline border, no gradient/glow/blur.
 * The Tracwell-style alternative to GlassCard: used where a page has been
 * given that full treatment (see apps/web/components/projects/project-shell.tsx
 * and the project overview page) rather than the app's usual glassy look.
 * Not a global replacement for GlassCard — most of the app still uses that.
 */
export function FlatCard({
  className,
  hover = false,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface",
        hover && "transition-colors hover:bg-surface-hover",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
