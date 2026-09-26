"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MoreVertical, Pencil, RotateCw, Trash2 } from "lucide-react";
import type { ServerSummary } from "@deplyr/shared-types";
import { EditServerDialog } from "@/components/servers/edit-server-dialog";
import { DeleteServerDialog } from "@/components/servers/delete-server-dialog";
import { useServer } from "@/components/servers/server-context";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Rename, fix a bad IP/credential, or delete — always available regardless
 * of connection status, since "error" is exactly when you need these most. */
export function ServerOptionsMenu({ server }: { server: ServerSummary }) {
  const { refresh } = useServer();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function retry() {
    setOpen(false);
    setRetrying(true);
    try {
      const res = await fetch(`${API_URL}/servers/${server.id}/retry`, { method: "POST", credentials: "include" });
      if (res.ok) refresh();
    } finally {
      setRetrying(false);
    }
  }

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
        aria-label="Server options"
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
            onClick={retry}
            disabled={retrying}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition hover:bg-surface-hover disabled:opacity-60"
          >
            {retrying ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />
            ) : (
              <RotateCw className="h-3.5 w-3.5 text-muted" strokeWidth={1.75} />
            )}
            {retrying ? "Retrying…" : "Reconnect"}
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setEditOpen(true);
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition hover:bg-surface-hover"
          >
            <Pencil className="h-3.5 w-3.5 text-muted" strokeWidth={1.75} />
            Edit server
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
            Delete server
          </button>
        </div>
      ) : null}

      <EditServerDialog server={server} open={editOpen} onClose={() => setEditOpen(false)} onSaved={refresh} />
      <DeleteServerDialog server={server} open={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </div>
  );
}
