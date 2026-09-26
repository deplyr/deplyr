"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, Mail } from "lucide-react";
import { GithubConnect } from "@/components/github/github-connect";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const inputClass =
  "w-full rounded-xl border border-border bg-surface-hover py-2.5 pl-10 pr-3 text-sm text-foreground placeholder:text-muted/70 transition focus:border-accent/60 focus:bg-surface focus:outline-none focus:ring-4 focus:ring-accent/10";

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [oauthEnabled, setOauthEnabled] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/auth/config`, { credentials: "include" })
      .then((r) => r.json())
      .then((cfg: { githubOAuth: boolean; needsSetup: boolean }) => {
        setOauthEnabled(cfg.githubOAuth);
        // Setup only exists for a fresh instance.
        if (!cfg.needsSetup) router.replace("/login");
      })
      .catch(() => setError("could not reach the server"));
  }, [router]);

  async function createAdmin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "something went wrong");
        return;
      }
      setStep(2);
    } catch {
      setError("could not reach the server");
    } finally {
      setBusy(false);
    }
  }

  function finish() {
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-xl sm:p-10">
      <p className="text-xs uppercase tracking-widest text-accent">
        Setup · step {step} of 2
      </p>
      <div className="mt-3 flex gap-1.5">
        <div className="h-1 flex-1 rounded-full bg-accent" />
        <div className={`h-1 flex-1 rounded-full ${step === 2 ? "bg-accent" : "bg-border"}`} />
      </div>

      {step === 1 ? (
        <>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">
            Create the admin account
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            This is your own Deplyr instance. The first account becomes its owner.
          </p>
          <form onSubmit={createAdmin} className="mt-7 space-y-3">
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={1.75} />
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={1.75} />
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="Password (8+ characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
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
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground shadow-lg shadow-accent/20 transition hover:brightness-110 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Continue
            </button>
          </form>
        </>
      ) : (
        <>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">
            Connect GitHub
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Deplyr needs read access to clone the repos you deploy. You can also do this later
            from Settings.
          </p>
          <div className="mt-7">
            <GithubConnect githubLogin={null} oauthEnabled={oauthEnabled} onConnected={finish} />
          </div>
          <button
            onClick={finish}
            className="mt-5 w-full text-center text-sm text-muted transition hover:text-foreground"
          >
            Skip for now
          </button>
        </>
      )}
    </div>
  );
}
