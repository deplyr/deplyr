"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, X } from "lucide-react";
import type { ProjectSummary } from "@deplyr/shared-types";
import { Button } from "@/components/ui/button";
import { FormError, inputClass } from "@/components/ui/field";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Deletes the project row, which cascades to its secrets, deploys, databases
 * and domains (see packages/db/src/schema.ts). Like server delete, this only
 * removes Deplyr's record of it — the containers already running on the
 * server keep running there until something else deploys over them.
 * Requires typing the name back, same as server delete.
 */
export function DeleteProjectDialog({
  project,
  open,
  onClose,
}: {
  project: ProjectSummary;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConfirmText("");
    setError(null);
    setDeleting(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !deleting && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, deleting]);

  if (!open) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDeleting(true);
    try {
      const res = await fetch(`${API_URL}/projects/${project.id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Couldn't delete this project.");
        return;
      }
      router.push("/projects");
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setDeleting(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto px-4 py-[8vh]" role="dialog" aria-modal="true" aria-label="Delete project">
      <div className="fixed inset-0 animate-fade-up bg-black/60 backdrop-blur-sm" onClick={() => !deleting && onClose()} />
      <div className="relative w-full max-w-md animate-fade-up rounded-2xl border border-danger/25 bg-surface shadow-xl">
        <form onSubmit={submit} className="p-6 sm:p-8">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-danger/10 text-danger">
                <AlertTriangle className="h-4 w-4" strokeWidth={1.75} />
              </span>
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Delete {project.name}</h2>
                <p className="mt-1 text-sm text-muted">
                  Removes this project, its secrets, deploy history, database and domains from Deplyr. It does not
                  stop or remove anything running on the server itself.
                </p>
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted transition hover:bg-surface-hover hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">
              Type <span className="font-mono text-danger">{project.name}</span> to confirm
            </span>
            <input
              autoFocus
              required
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              className={inputClass}
            />
          </label>

          {error ? (
            <div className="mt-4">
              <FormError>{error}</FormError>
            </div>
          ) : null}

          <div className="mt-6 flex items-center justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose} disabled={deleting}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" disabled={deleting || confirmText !== project.name}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {deleting ? "Deleting…" : "Delete project"}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
