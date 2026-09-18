"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, PartyPopper } from "lucide-react";
import type { DeploySummary } from "@argo/shared-types";
import { DeployChecklist } from "@/components/deploys/deploy-checklist";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const POLL_INTERVAL_MS = 1500;

export default function DeployDetailPage() {
  const { id, deployId } = useParams<{ id: string; deployId: string }>();
  const [deploy, setDeploy] = useState<DeploySummary | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      const res = await fetch(`${API_URL}/deploys/${deployId}`, { credentials: "include" });
      if (cancelled) return;

      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) return;

      const data: DeploySummary = await res.json();
      if (cancelled) return;
      setDeploy(data);

      if (data.status === "queued" || data.status === "running") {
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [deployId]);

  if (notFound) {
    return (
      <div className="mx-auto max-w-lg px-8 py-10 text-sm text-muted">Deploy not found.</div>
    );
  }

  if (!deploy) {
    return (
      <div className="mx-auto max-w-lg px-8 py-10 text-sm text-muted">Loading...</div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-8 py-10">
      <Link
        href={`/projects/${id}`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        Back to project
      </Link>

      <header className="mb-6">
        <h1 className="text-lg font-semibold">Deploy</h1>
        <p className="mt-1 text-sm text-muted">
          {deploy.status === "success"
            ? "Live."
            : deploy.status === "failed"
              ? "Failed — see the step below for details."
              : "In progress..."}
        </p>
      </header>

      <DeployChecklist steps={deploy.steps} />

      {deploy.status === "success" ? (
        <div className="mt-6 flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-4 py-3 text-sm text-foreground">
          <PartyPopper className="h-4 w-4 text-success" strokeWidth={1.75} />
          Your app is live.
        </div>
      ) : null}
    </div>
  );
}
