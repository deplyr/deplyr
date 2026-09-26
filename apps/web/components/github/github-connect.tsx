"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, Github, KeyRound, Loader2, RotateCw, Unlink } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const TOKEN_URL =
  "https://github.com/settings/tokens/new?scopes=repo&description=Deplyr";

interface GithubConnectProps {
  githubLogin: string | null;
  oauthEnabled: boolean;
  /** Called after a successful token save; defaults to refreshing the page. */
  onConnected?: () => void;
}

export function GithubConnect({ githubLogin, oauthEnabled, onConnected }: GithubConnectProps) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [usePat, setUsePat] = useState(!oauthEnabled);
  // A connected GitHub can still have a dead token underneath — revoked on
  // GitHub's side, or auto-revoked as a leaked secret. There's no way to
  // detect that here (it only shows up as a 401 the next time something
  // tries to use it), so "Reconnect" is always offered next to Disconnect
  // rather than only appearing once something has visibly failed.
  const [reconnecting, setReconnecting] = useState(false);

  async function saveToken(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/auth/github/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "something went wrong");
        return;
      }
      setToken("");
      setReconnecting(false);
      if (onConnected) onConnected();
      else router.refresh();
    } catch {
      setError("could not reach the server");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    await fetch(`${API_URL}/auth/github/token`, { method: "DELETE", credentials: "include" });
    setBusy(false);
    router.refresh();
  }

  if (githubLogin && !reconnecting) {
    return (
      <div className="flex items-center justify-between gap-4 rounded-xl border border-success/20 bg-success/5 px-4 py-3">
        <div className="flex items-center gap-3 text-sm">
          <CheckCircle2 className="h-4 w-4 text-success" strokeWidth={2} />
          <span>
            Connected as <span className="font-mono font-medium">@{githubLogin}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setReconnecting(true)}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted transition hover:bg-surface-hover hover:text-foreground disabled:opacity-60"
          >
            <RotateCw className="h-3.5 w-3.5" strokeWidth={1.75} />
            Reconnect
          </button>
          <button
            onClick={disconnect}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted transition hover:border-danger/25 hover:bg-danger/10 hover:text-danger disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" strokeWidth={1.75} />}
            Disconnect
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {reconnecting ? (
        <p className="text-xs text-muted">
          Currently connected as <span className="font-mono text-foreground">@{githubLogin}</span>. Reconnecting
          replaces the token on file.
        </p>
      ) : null}
      {oauthEnabled && !usePat ? (
        <>
          <a
            href={`${API_URL}/auth/github/login`}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
          >
            <Github className="h-4 w-4" strokeWidth={2} />
            Connect with GitHub
          </a>
          <button
            onClick={() => setUsePat(true)}
            className="w-full text-center text-xs text-muted transition hover:text-foreground"
          >
            Use a personal access token instead
          </button>
          {reconnecting ? (
            <button
              onClick={() => setReconnecting(false)}
              className="w-full text-center text-xs text-muted transition hover:text-foreground"
            >
              Cancel
            </button>
          ) : null}
        </>
      ) : (
        <form onSubmit={saveToken} className="space-y-3">
          <div className="rounded-xl border border-border bg-surface-hover p-4">
            <p className="text-sm font-medium">How to create the token (about a minute)</p>
            <ol className="mt-3 space-y-2.5 text-xs leading-relaxed text-muted">
              <li className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-semibold text-accent">1</span>
                <span>
                  Open{" "}
                  <a href={TOKEN_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
                    GitHub → New personal access token (classic) <ExternalLink className="h-3 w-3" />
                  </a>
                  . It opens with the note and the right scope already filled in.
                </span>
              </li>
              <li className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-semibold text-accent">2</span>
                <span>
                  Set <strong className="text-foreground">Expiration</strong> to whatever you like (&ldquo;No expiration&rdquo; means never having to redo this).
                </span>
              </li>
              <li className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-semibold text-accent">3</span>
                <span>
                  Under <strong className="text-foreground">Select scopes</strong>, make sure only{" "}
                  <code className="font-mono text-foreground">repo</code> is ticked. That one box covers public <em>and</em> private repositories, yours and your
                  organizations&apos;.
                </span>
              </li>
              <li className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-semibold text-accent">4</span>
                <span>
                  Scroll down and click <strong className="text-foreground">Generate token</strong>, then copy it straight away — it starts with{" "}
                  <code className="font-mono text-foreground">ghp_</code> and GitHub only shows it once.
                </span>
              </li>
              <li className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-semibold text-accent">5</span>
                <span>Paste it in the box below and press Save token.</span>
              </li>
            </ol>
            <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-muted">
              <strong className="text-foreground">Organization repos not showing up?</strong> On your{" "}
              <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer" className="text-accent hover:underline">tokens page</a>, click{" "}
              <strong className="text-foreground">Configure SSO → Authorize</strong> next to the token (needed when the org uses SSO). If the org blocks classic
              tokens entirely, an owner has to allow them under Org → Settings → Personal access tokens.
            </p>
          </div>

          <div className="relative">
            <KeyRound
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              strokeWidth={1.75}
            />
            <input
              type="password"
              required
              autoComplete="off"
              placeholder="ghp_… or github_pat_…"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface-hover py-2.5 pl-10 pr-3 font-mono text-sm text-foreground placeholder:text-muted/70 transition focus:border-accent/60 focus:bg-surface focus:outline-none focus:ring-4 focus:ring-accent/10"
            />
          </div>
          {error ? (
            <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition hover:brightness-110 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save token
          </button>
          {oauthEnabled ? (
            <button
              type="button"
              onClick={() => setUsePat(false)}
              className="w-full text-center text-xs text-muted transition hover:text-foreground"
            >
              Connect with GitHub instead
            </button>
          ) : null}
          {reconnecting ? (
            <button
              type="button"
              onClick={() => setReconnecting(false)}
              className="w-full text-center text-xs text-muted transition hover:text-foreground"
            >
              Cancel
            </button>
          ) : null}
        </form>
      )}
    </div>
  );
}
