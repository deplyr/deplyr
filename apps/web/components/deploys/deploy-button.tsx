"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Rocket } from "lucide-react";
import type { DeploySummary } from "@deplyr/shared-types";
import { Button } from "@/components/ui/button";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function DeployButton({
  projectId,
  disabled,
  disabledReason,
}: {
  projectId: string;
  disabled?: boolean;
  disabledReason?: string;
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
  }

  return (
    <div className="flex flex-col items-end">
      <Button onClick={handleClick} disabled={disabled || loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" strokeWidth={1.75} />}
        {loading ? "Starting…" : "Deploy"}
      </Button>
      {disabled && disabledReason ? (
        <p className="mt-2 text-xs text-muted">{disabledReason}</p>
      ) : null}
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
    </div>
  );
}
