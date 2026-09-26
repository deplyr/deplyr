"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/cn";

/** `value` may be a function so secrets can be fetched only at click time. */
export function CopyButton({ value, label, className }: { value: string | (() => Promise<string>); label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(typeof value === "function" ? await value() : value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked (insecure context) — nothing useful to do */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={`Copy ${label ?? "value"}`}
      aria-label={`Copy ${label ?? "value"}`}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-surface-hover hover:text-foreground",
        copied && "text-success",
        className,
      )}
    >
      {copied ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />}
    </button>
  );
}
