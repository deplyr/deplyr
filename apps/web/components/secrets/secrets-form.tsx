"use client";

import { useState } from "react";
import type { SecretSummary } from "@argo/shared-types";
import { Button } from "@/components/ui/button";
import { humanizeKey } from "@/lib/humanize-key";
import { cn } from "@/lib/cn";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const inputClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm text-foreground placeholder:font-sans placeholder:text-muted focus:border-accent focus:outline-none";

export function SecretsForm({
  projectId,
  initialSecrets,
}: {
  projectId: string;
  initialSecrets: SecretSummary[];
}) {
  const [secretsState, setSecretsState] = useState(initialSecrets);
  const [values, setValues] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [revealing, setRevealing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReveal(key: string) {
    setRevealing(key);
    setError(null);
    const res = await fetch(
      `${API_URL}/projects/${projectId}/secrets/${encodeURIComponent(key)}/reveal`,
      { credentials: "include" },
    );
    if (res.ok) {
      const body: { value: string } = await res.json();
      setValues((v) => ({ ...v, [key]: body.value }));
      setRevealed((r) => new Set(r).add(key));
    } else {
      setError("Could not reveal that secret.");
    }
    setRevealing(null);
  }

  async function handleSave() {
    const changed = Object.entries(values);
    if (changed.length === 0) return;
    setSaving(true);
    setError(null);
    setJustSaved(false);

    const res = await fetch(`${API_URL}/projects/${projectId}/secrets`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secrets: changed.map(([key, value]) => ({ key, value })),
      }),
    });

    if (!res.ok) {
      setError("Could not save secrets.");
      setSaving(false);
      return;
    }

    const changedKeys = new Set(changed.map(([key]) => key));
    setSecretsState((prev) =>
      prev.map((s) =>
        changedKeys.has(s.key) ? { ...s, hasValue: (values[s.key] ?? "").length > 0 } : s,
      ),
    );
    setSaving(false);
    setJustSaved(true);
  }

  if (secretsState.length === 0) {
    return (
      <p className="text-sm text-muted">
        No secrets detected — Argo looks for a{" "}
        <code className="font-mono">.env.example</code> file in the repo when
        the project is created.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {secretsState.map((secret) => {
        const isRevealed = revealed.has(secret.key);
        const isNewEntry = !secret.hasValue;
        const editable = isNewEntry || isRevealed;

        return (
          <div key={secret.key}>
            <div className="mb-1.5 flex items-baseline justify-between">
              <label className="text-sm font-medium text-foreground">
                {humanizeKey(secret.key)}
              </label>
              <span className="font-mono text-[11px] text-muted">{secret.key}</span>
            </div>
            <div className="flex gap-2">
              {editable ? (
                <input
                  type={isRevealed ? "text" : "password"}
                  value={values[secret.key] ?? ""}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [secret.key]: e.target.value }))
                  }
                  placeholder={isNewEntry ? "Not set" : undefined}
                  className={inputClass}
                />
              ) : (
                <input
                  type="text"
                  value="••••••••••••"
                  disabled
                  className={cn(inputClass, "text-muted")}
                />
              )}
              {!isNewEntry && !isRevealed ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => handleReveal(secret.key)}
                  disabled={revealing === secret.key}
                >
                  {revealing === secret.key ? "..." : "Reveal"}
                </Button>
              ) : null}
            </div>
          </div>
        );
      })}

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <div className="flex items-center gap-3 pt-2">
        <Button type="button" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save changes"}
        </Button>
        {justSaved ? <span className="text-xs text-muted">Saved.</span> : null}
      </div>
    </div>
  );
}
