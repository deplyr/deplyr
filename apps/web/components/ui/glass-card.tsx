import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** Gradient-bordered frosted panel — same treatment as the login card. */
export function GlassCard({
  className,
  innerClassName,
  hover = false,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { innerClassName?: string; hover?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-gradient-to-b from-white/[0.16] to-white/[0.03] p-px shadow-xl shadow-black/30",
        hover && "transition duration-300 hover:-translate-y-0.5 hover:from-accent/40 hover:shadow-accent/10",
        className,
      )}
      {...props}
    >
      <div
        className={cn("h-full rounded-[calc(1rem-1px)] bg-[#0c0c10]/90 backdrop-blur-xl", innerClassName)}
      >
        {children}
      </div>
    </div>
  );
}
