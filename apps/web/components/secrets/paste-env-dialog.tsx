"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ClipboardPaste, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseEnvPaste, type ParsedEnvVar } from "@/lib/parse-env-paste";
import { cn } from "@/lib/cn";

const textareaClass =
  "h-56 w-full resize-none rounded-xl border border-border bg-surface-hover px-3.5 py-2.5 font-mono text-xs leading-relaxed text-foreground placeholder:font-sans placeholder:text-muted/70 transition focus:border-accent/60 focus:bg-surface focus:outline-none focus:ring-4 focus:ring-accent/10";

/**
 * Paste a whole .env block and import every KEY=VALUE line at once,
 * instead of typing them in one at a time — same idea as Vercel's "paste
 * .env" import. Only fills the form; saving still goes through the normal
 * Save changes button so a bad paste is easy to back out of before it's
 * written anywhere.
 */
export function PasteEnvDialog({
  open,
  onClose,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  onImport: (vars: ParsedEnvVar[]) => void;
}) {
  const [text, setText] = useState("");

  useEffect(() => {
    if (!open) return;
    setText("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const parsed = useMemo(() => parseEnvPaste(text), [text]);

  if (!open) return null;

  function handleImport() {
    if (parsed.length === 0) return;
    onImport(parsed);
    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto px-4 py-[8vh]" role="dialog" aria-modal="true" aria-label="Paste .env">
      <div className="fixed inset-0 animate-fade-up bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg animate-fade-up rounded-2xl border border-border bg-surface shadow-xl">
        <div className="p-6 sm:p-8">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Paste .env</h2>
              <p className="mt-1 text-sm text-muted">Existing keys get updated, new ones get added.</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted transition hover:bg-surface-hover hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"DATABASE_URL=postgresql://user:pass@host/db\nRESEND_API_KEY=re_...\n# comments and blank lines are fine"}
            spellCheck={false}
            className={textareaClass}
          />

          <p className={cn("mt-2.5 text-xs", parsed.length > 0 ? "text-muted" : "text-muted/60")}>
            {text.trim() === ""
              ? "Paste from your terminal, a .env file, or a password manager."
              : parsed.length === 0
                ? "No KEY=VALUE lines found."
                : `${parsed.length} variable${parsed.length === 1 ? "" : "s"} found: ${parsed.map((p) => p.key).join(", ")}`}
          </p>

          <div className="mt-6 flex items-center justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={handleImport} disabled={parsed.length === 0}>
              <ClipboardPaste className="h-4 w-4" strokeWidth={1.75} />
              Import {parsed.length > 0 ? parsed.length : ""}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
