"use client";

import { useState } from "react";
import { Check, Loader2, RotateCw, X } from "lucide-react";
import type { ServerSummary } from "@deplyr/shared-types";
import { useServer } from "@/components/servers/server-context";
import { Button } from "@/components/ui/button";
import { FlatCard } from "@/components/ui/flat-card";
import { cn } from "@/lib/cn";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Derived from the flags the installer sets — no extra API needed. */
function stepsFor(server: ServerSummary) {
  // An error before Docker/agent exist could be SSH or the Docker step; the
  // message is the only clue, so read it rather than guess "SSH worked".
  const sshFailed =
    server.status === "error" &&
    !server.dockerInstalled &&
    server.agentConnectedAt === null &&
    /ssh|auth|password|key|refused|timed? ?out|unreachable|host|connect/i.test(server.statusDetail ?? "");
  const sshDone =
    !sshFailed && (server.status === "installing" || server.dockerInstalled || server.agentConnectedAt !== null || server.status === "error");
  const steps = [
    { label: "Connect over SSH", detail: "Opening a one-time session as root", done: sshDone },
    { label: "Install Docker", detail: "Runs your apps and databases", done: server.dockerInstalled },
    { label: "Start the Deplyr agent", detail: "Dials back to the control plane", done: server.agentConnectedAt !== null },
    { label: "Receive first report", detail: "CPU, memory and disk", done: server.metricsUpdatedAt !== null },
  ];
  const current = steps.findIndex((s) => !s.done);
  return { steps, current };
}

export function InstallProgress({ server }: { server: ServerSummary }) {
  const { refresh } = useServer();
  const { steps, current } = stepsFor(server);
  const failed = server.status === "error";
  const doneCount = steps.filter((s) => s.done).length;
  const [retrying, setRetrying] = useState(false);

  async function retry() {
    setRetrying(true);
    try {
      const res = await fetch(`${API_URL}/servers/${server.id}/retry`, { method: "POST", credentials: "include" });
      if (res.ok) refresh();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <FlatCard className={cn("animate-fade-up p-6 sm:p-8", failed && "border-danger/25 bg-danger/[0.03]")}>
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              {failed ? "Setup hit a problem" : "Setting up your server"}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {failed
                ? "Fix the issue below, then connect the server again."
                : "This usually takes a couple of minutes. You can leave this page."}
            </p>
          </div>
          {failed ? (
            <Button type="button" variant="secondary" onClick={retry} disabled={retrying}>
              {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" strokeWidth={1.75} />}
              {retrying ? "Retrying…" : "Retry connection"}
            </Button>
          ) : (
            <span className="font-mono text-xs text-muted">
              {doneCount}/{steps.length}
            </span>
          )}
        </div>

        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-border">
          <div
            className={cn("h-full rounded-full transition-all duration-700", failed ? "bg-danger" : "bg-accent")}
            style={{ width: `${(doneCount / steps.length) * 100}%` }}
          />
        </div>

        <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => {
            const active = i === current;
            const isFailed = failed && active;
            return (
              <li
                key={step.label}
                className={cn(
                  "rounded-xl border p-4 transition",
                  step.done && "border-success/20 bg-success/[0.04]",
                  active && !isFailed && "border-accent/40 bg-accent/[0.06]",
                  isFailed && "border-danger/30 bg-danger/[0.06]",
                  !step.done && !active && "border-border opacity-60",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full",
                    step.done && "bg-success/15 text-success",
                    active && !isFailed && "bg-accent/15 text-accent",
                    isFailed && "bg-danger/15 text-danger",
                    !step.done && !active && "border border-border text-muted",
                  )}
                >
                  {step.done ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                  ) : isFailed ? (
                    <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                  ) : active ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <span className="font-mono text-xs">{i + 1}</span>
                  )}
                </span>
                <p className="mt-3 text-sm font-medium">{step.label}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{step.detail}</p>
              </li>
            );
          })}
        </ol>

        {server.statusDetail ? (
          <div
            className={cn(
              "mt-5 rounded-xl border px-4 py-3 font-mono text-xs leading-relaxed",
              failed ? "border-danger/25 bg-danger/5 text-danger" : "border-border bg-surface-hover text-muted",
            )}
          >
            <span className="mr-2 text-muted/60">›</span>
            {server.statusDetail}
          </div>
        ) : null}
      </div>
    </FlatCard>
  );
}
