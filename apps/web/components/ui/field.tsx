import type { ReactNode } from "react";

export const inputClass =
  "w-full rounded-xl border border-border bg-surface-hover px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted/70 transition focus:border-accent/60 focus:bg-surface focus:outline-none focus:ring-4 focus:ring-accent/10 disabled:opacity-60 [&:-webkit-autofill]:[-webkit-text-fill-color:hsl(var(--foreground))] [&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_hsl(var(--surface-hover))]";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function FormError({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
      {children}
    </p>
  );
}
