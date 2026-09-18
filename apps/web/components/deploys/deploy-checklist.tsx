"use client";

import { useState } from "react";
import { Check, X, Loader2, Circle, ChevronDown, ChevronRight } from "lucide-react";
import type { DeployStepSummary } from "@argo/shared-types";
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
    <div className="space-y-1">
      {steps.map((step) => {
        const isOpen = expanded.has(step.name);
        return (
          <div key={step.name} className="rounded-md border border-border">
            <button
              type="button"
              onClick={() => toggle(step.name)}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm"
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
              <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap border-t border-border bg-background px-3 py-2.5 font-mono text-xs text-muted">
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
