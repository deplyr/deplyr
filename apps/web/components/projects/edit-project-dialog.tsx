"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import type { ProjectSummary } from "@deplyr/shared-types";
import { Button } from "@/components/ui/button";
import { Field, FormError, inputClass } from "@/components/ui/field";
import { useOnOpen } from "@/lib/use-on-open";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Renames a project. Branch, root directory and build commands live on the
 * Settings tab instead (PUT /projects/:id/settings) — this dialog is just
 * the name, the one thing that has nowhere else to be edited.
 */
export function EditProjectDialog({
  project,
  open,
  onClose,
  onSaved,
}: {
  project: ProjectSummary;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Only when it opens — `project` is re-fetched by polling and would erase typing.
  useOnOpen(open, () => {
    setName(project.name);
    setError(null);
    setSaving(false);
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !saving && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, saving]);

  if (!open) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim() === project.name) {
      onClose();
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/projects/${project.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Couldn't save that change.");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto px-4 py-[8vh]" role="dialog" aria-modal="true" aria-label="Edit project">
      <div className="fixed inset-0 animate-fade-up bg-black/60 backdrop-blur-sm" onClick={() => !saving && onClose()} />
      <div className="relative w-full max-w-md animate-fade-up rounded-2xl border border-border bg-surface shadow-xl">
        <form onSubmit={submit} className="p-6 sm:p-8">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Edit project</h2>
              <p className="mt-1 text-sm text-muted">Branch and build settings are on the Settings tab.</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted transition hover:bg-surface-hover hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <Field label="Name">
            <input autoFocus required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </Field>

          {error ? (
            <div className="mt-4">
              <FormError>{error}</FormError>
            </div>
          ) : null}

          <div className="mt-6 flex items-center justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
