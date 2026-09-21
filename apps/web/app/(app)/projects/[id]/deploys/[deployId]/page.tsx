"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowRight, CheckCircle2, Loader2, XCircle } from "lucide-react";
import type { DeploySummary } from "@deplyr/shared-types";
import { DeployChecklist } from "@/components/deploys/deploy-checklist";
import { GlassCard } from "@/components/ui/glass-card";
import { Page, PageHeader } from "@/components/ui/page";
import { cn } from "@/lib/cn";

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
      <Page width="narrow">
        <PageHeader back={{ href: `/projects/${id}`, label: "Back to project" }} title="Deploy not found" />
      </Page>
    );
  }

  if (!deploy) {
    return (
      <Page width="narrow">
        <div className="h-64 animate-pulse rounded-2xl bg-white/[0.04]" />
      </Page>
    );
  }

  const done = deploy.steps.filter((s) => s.status === "success").length;
  const total = deploy.steps.length || 1;
  const ok = deploy.status === "success";
  const failed = deploy.status === "failed";

  return (
    <Page width="narrow">
      <PageHeader back={{ href: `/projects/${id}`, label: "Back to project" }} />

      <GlassCard className="animate-fade-up" innerClassName="relative overflow-hidden">
        <div
          className={cn(
            "pointer-events-none absolute -left-16 -top-20 h-64 w-64 rounded-full blur-[80px]",
            ok ? "bg-success/25" : failed ? "bg-danger/25" : "bg-accent/20",
          )}
        />
        <div className="relative p-6 sm:p-8">
          <div className="flex items-center gap-4">
            <span
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-2xl",
                ok ? "bg-success/15 text-success" : failed ? "bg-danger/15 text-danger" : "bg-accent/15 text-accent",
              )}
            >
              {ok ? <CheckCircle2 className="h-6 w-6" /> : failed ? <XCircle className="h-6 w-6" /> : <Loader2 className="h-6 w-6 animate-spin" />}
            </span>
            <div>
              <h1 className="font-mono text-2xl font-semibold tracking-tight">
                {ok ? "Your app is live" : failed ? "Deploy failed" : "Deploying…"}
              </h1>
              <p className="mt-1 text-sm text-muted">
                {ok
                  ? "Everything passed. Nice."
                  : failed
                    ? "Open the failed step below to see what went wrong."
                    : `${done} of ${total} steps done`}
              </p>
            </div>
          </div>
          <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className={cn("h-full rounded-full transition-all duration-700", failed ? "bg-danger" : ok ? "bg-success" : "bg-accent")}
              style={{ width: `${(done / total) * 100}%` }}
            />
          </div>
        </div>
      </GlassCard>

      <div className="animate-fade-up" style={{ animationDelay: "70ms" }}>
        <DeployChecklist steps={deploy.steps} />
      </div>
      {ok ? (
        <a
          href={`/projects/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
        >
          Back to project <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} />
        </a>
      ) : null}
    </Page>
  );
}
