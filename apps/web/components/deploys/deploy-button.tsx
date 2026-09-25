"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Rocket, RotateCw } from "lucide-react";
import type { DeploySummary } from "@deplyr/shared-types";
import { Button } from "@/components/ui/button";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function DeployButton({
  projectId,
  disabled,
  disabledReason,
  /** The last deploy failed — same action (a fresh deploy), different
   * wording so it reads as "fix it and try again" instead of a first push. */
  retry,
}: {
  projectId: string;
  disabled?: boolean;
  disabledReason?: string;
  retry?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);

    const res = await fetch(`${API_URL}/projects/${projectId}/deploys`, {
      method: "POST",
      credentials: "include",
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Could not start a deploy.");
      setLoading(false);
      return;
    }

    const deploy: DeploySummary = await res.json();
    router.push(`/projects/${projectId}/deploys/${deploy.id}`);
    // Not a finally: the hero this button lives in persists across the
    // project's sub-pages (only `children` swaps), so this component
    // never unmounts on that push — without resetting here it's stuck on
    // "Starting…" until something else in the app happens to re-render it.
    setLoading(false);
  }

  return (
    <div className="flex flex-col items-end">
      <Button onClick={handleClick} disabled={disabled || loading}>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : retry ? (
          <RotateCw className="h-4 w-4" strokeWidth={1.75} />
        ) : (
          <Rocket className="h-4 w-4" strokeWidth={1.75} />
        )}
        {loading ? "Starting…" : retry ? "Retry" : "Deploy"}
      </Button>
      {disabled && disabledReason ? (
        <p className="mt-2 text-xs text-muted">{disabledReason}</p>
      ) : null}
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
    </div>
  );
}
