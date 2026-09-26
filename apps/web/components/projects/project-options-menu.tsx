"use client";

import { useEffect, useRef, useState } from "react";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import type { ProjectSummary } from "@deplyr/shared-types";
import { EditProjectDialog } from "@/components/projects/edit-project-dialog";
import { DeleteProjectDialog } from "@/components/projects/delete-project-dialog";
import { useProject } from "@/components/projects/project-context";

/** Rename or delete — mirrors ServerOptionsMenu, minus "reconnect" (projects
 * have nothing to retry; a failed deploy is fixed by deploying again). */
export function ProjectOptionsMenu({ project }: { project: ProjectSummary }) {
  const { refresh } = useProject();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Project options"
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface-hover text-muted transition hover:bg-surface hover:text-foreground"
      >
        <MoreVertical className="h-4 w-4" strokeWidth={1.75} />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-12 z-40 w-52 animate-fade-up rounded-xl border border-border bg-surface p-1.5 shadow-xl"
        >
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setEditOpen(true);
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition hover:bg-surface-hover"
          >
            <Pencil className="h-3.5 w-3.5 text-muted" strokeWidth={1.75} />
            Edit project
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setDeleteOpen(true);
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-danger transition hover:bg-danger/10"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            Delete project
          </button>
        </div>
      ) : null}

      <EditProjectDialog project={project} open={editOpen} onClose={() => setEditOpen(false)} onSaved={refresh} />
      <DeleteProjectDialog project={project} open={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </div>
  );
}
