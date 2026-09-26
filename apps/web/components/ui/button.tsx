import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const variants = {
  primary:
    "bg-accent text-accent-foreground shadow-lg shadow-accent/20 hover:brightness-110 active:scale-[0.99]",
  secondary:
    "border border-border bg-surface-hover text-foreground hover:bg-surface active:scale-[0.99]",
  danger: "border border-danger/25 bg-danger/10 text-danger hover:bg-danger/20",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
}

export function buttonClass(variant: keyof typeof variants = "primary", className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-50",
    variants[variant],
    className,
  );
}

export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return <button className={buttonClass(variant, className)} {...props} />;
}
