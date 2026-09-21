"use client";

import { useState } from "react";
import { Check, X, Loader2, Circle, ChevronDown, ChevronRight } from "lucide-react";
import type { DeployStepSummary } from "@deplyr/shared-types";
import { DEPLOY_STEP_LABELS } from "@/lib/deploy-step-labels";
import { cn } from "@/lib/cn";

export function DeployChecklist({ steps }: { steps: DeployStepSummary[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(name: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <div className="space-y-2">
      {steps.map((step) => {
        const isOpen = expanded.has(step.name);
        return (
          <div
            key={step.name}
            className={cn(
              "overflow-hidden rounded-xl border transition-colors",
              step.status === "running" && "border-accent/40 bg-accent/[0.05]",
              step.status === "failed" && "border-danger/30 bg-danger/[0.05]",
              step.status !== "running" && step.status !== "failed" && "border-white/[0.08] bg-white/[0.02]",
            )}
          >
            <button
              type="button"
              onClick={() => toggle(step.name)}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm"
            >
              <StepIcon status={step.status} />
              <span
                className={cn(
                  "flex-1",
                  step.status === "pending" ? "text-muted" : "text-foreground",
                )}
              >
                {DEPLOY_STEP_LABELS[step.name]}
              </span>
              {step.log ? (
                isOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 text-muted" strokeWidth={1.75} />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-muted" strokeWidth={1.75} />
                )
              ) : null}
            </button>
            {isOpen && step.log ? (
              <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap border-t border-white/[0.07] bg-black/40 px-4 py-3 font-mono text-xs leading-relaxed text-muted">
                {step.log}
              </pre>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function StepIcon({ status }: { status: DeployStepSummary["status"] }) {
  if (status === "success") {
    return <Check className="h-4 w-4 shrink-0 text-success" strokeWidth={2} />;
  }
  if (status === "failed") {
    return <X className="h-4 w-4 shrink-0 text-danger" strokeWidth={2} />;
  }
  if (status === "running") {
    return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent" strokeWidth={2} />;
  }
  return <Circle className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} />;
}
