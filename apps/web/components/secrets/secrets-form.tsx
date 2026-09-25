"use client";

import { useState } from "react";
import type { SecretSummary } from "@deplyr/shared-types";
import { ClipboardPaste, Eye, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { GlassCard } from "@/components/ui/glass-card";
import { PasteEnvDialog } from "@/components/secrets/paste-env-dialog";
import { humanizeKey } from "@/lib/humanize-key";
import type { ParsedEnvVar } from "@/lib/parse-env-paste";
import { cn } from "@/lib/cn";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 font-mono text-sm text-foreground placeholder:font-sans placeholder:text-muted/70 transition focus:border-accent/60 focus:bg-white/[0.06] focus:outline-none focus:ring-4 focus:ring-accent/10";

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
  const [pasteOpen, setPasteOpen] = useState(false);

  function handleImport(vars: ParsedEnvVar[]) {
    setJustSaved(false);
    setValues((v) => {
      const next = { ...v };
      for (const { key, value } of vars) next[key] = value;
      return next;
    });
    // Imported values are already in `values`, ready to save — show them as
    // plain text immediately instead of behind a "Reveal" a second click away.
    setRevealed((r) => {
      const next = new Set(r);
      for (const { key } of vars) next.add(key);
      return next;
    });
    setSecretsState((prev) => {
      const existingKeys = new Set(prev.map((s) => s.key));
      const additions = vars
        .filter((v) => !existingKeys.has(v.key))
        .map((v) => ({ key: v.key, source: "user" as const, hasValue: false }));
      if (additions.length === 0) return prev;
      return [...prev, ...additions].sort((a, b) => a.key.localeCompare(b.key));
    });
  }

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
      <>
        <GlassCard innerClassName="flex flex-col items-center px-6 py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <KeyRound className="h-5 w-5" strokeWidth={1.5} />
          </span>
          <p className="mt-4 text-sm font-medium">No secrets detected</p>
          <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-muted">
            Deplyr looks for a <code className="font-mono text-foreground">.env.example</code> file in
            your repo when the project is created. Paste one in instead:
          </p>
          <Button type="button" variant="secondary" onClick={() => setPasteOpen(true)} className="mt-5">
            <ClipboardPaste className="h-4 w-4" strokeWidth={1.75} />
            Paste .env
          </Button>
        </GlassCard>
        <PasteEnvDialog open={pasteOpen} onClose={() => setPasteOpen(false)} onImport={handleImport} />
      </>
    );
  }

  return (
    <GlassCard innerClassName="space-y-5 p-6 sm:p-8">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted">{secretsState.length} variable{secretsState.length === 1 ? "" : "s"}</p>
        <Button type="button" variant="secondary" onClick={() => setPasteOpen(true)}>
          <ClipboardPaste className="h-4 w-4" strokeWidth={1.75} />
          Paste .env
        </Button>
      </div>

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
                  {revealing === secret.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" strokeWidth={1.75} />}
                  Reveal
                </Button>
              ) : null}
            </div>
          </div>
        );
      })}

      {error ? <FormError>{error}</FormError> : null}

      <div className="flex items-center gap-3 border-t border-white/[0.07] pt-5">
        <Button type="button" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {saving ? "Saving…" : "Save changes"}
        </Button>
        {justSaved ? <span className="text-xs text-success">Saved — redeploy to apply.</span> : null}
      </div>

      <PasteEnvDialog open={pasteOpen} onClose={() => setPasteOpen(false)} onImport={handleImport} />
    </GlassCard>
  );
}
