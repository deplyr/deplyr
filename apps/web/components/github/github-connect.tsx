"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, Github, KeyRound, Loader2 } from "lucide-react";

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
        <div className="flex items-center gap-3">
          <button
            onClick={() => setReconnecting(true)}
            disabled={busy}
            className="text-xs text-muted transition hover:text-foreground disabled:opacity-50"
          >
            Reconnect
          </button>
          <button
            onClick={disconnect}
            disabled={busy}
            className="text-xs text-muted transition hover:text-danger disabled:opacity-50"
          >
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
            className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-white/90"
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
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-2.5 pl-10 pr-3 font-mono text-sm text-foreground placeholder:text-muted/70 transition focus:border-accent/60 focus:outline-none focus:ring-4 focus:ring-accent/10"
            />
          </div>
          <p className="text-xs leading-relaxed text-muted">
            Needs the <code className="font-mono text-foreground">repo</code> scope (classic) or
            read access to Contents (fine-grained).{" "}
            <a
              href={TOKEN_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-accent hover:underline"
            >
              Create one <ExternalLink className="h-3 w-3" />
            </a>
          </p>
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
