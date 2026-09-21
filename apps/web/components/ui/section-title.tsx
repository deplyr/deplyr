import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

// Its own file, deliberately NOT a client component: server pages pass it an
// icon (a component), which can't cross into a client module.
export function SectionTitle({ icon: Icon, children, meta }: { icon?: LucideIcon; children: ReactNode; meta?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {Icon ? <Icon className="h-4 w-4 text-accent" strokeWidth={1.75} /> : null}
        <h2 className="text-sm font-semibold">{children}</h2>
      </div>
      {meta ? <span className="text-xs text-muted">{meta}</span> : null}
    </div>
  );
}
