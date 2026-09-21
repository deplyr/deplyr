import type { LucideIcon } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <GlassCard className="animate-fade-up" innerClassName="relative overflow-hidden">
      <div className="pointer-events-none absolute left-1/2 top-0 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/20 blur-[70px]" />
      <div className="relative flex flex-col items-center justify-center px-6 py-20 text-center">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 shadow-lg shadow-accent/10">
          <Icon className="h-6 w-6 text-accent" strokeWidth={1.5} />
        </div>
        <h3 className="font-mono text-base font-semibold">{title}</h3>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">{description}</p>
        {action ? <div className="mt-6">{action}</div> : null}
      </div>
    </GlassCard>
  );
}
