"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Github, Loader2, Mail, Lock } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const inputClass =
  "w-full rounded-xl border border-border bg-surface-hover py-2.5 pl-10 pr-3 text-sm text-foreground placeholder:text-muted/70 transition focus:border-accent/60 focus:bg-surface focus:outline-none focus:ring-4 focus:ring-accent/10 [&:-webkit-autofill]:[-webkit-text-fill-color:hsl(var(--foreground))] [&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_hsl(var(--surface-hover))]";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [githubOAuth, setGithubOAuth] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/auth/config`, { credentials: "include" })
      .then((r) => r.json())
      .then((cfg: { githubOAuth: boolean; needsSetup: boolean }) => {
        // Fresh self-hosted instance: nobody to sign in as yet.
        if (cfg.needsSetup) router.replace("/setup");
        setGithubOAuth(cfg.githubOAuth);
      })
      .catch(() => {});

    // Not useSearchParams — that needs a Suspense boundary this page
    // doesn't otherwise want, and this only ever matters right after the
    // GitHub OAuth redirect lands here.
    if (new URLSearchParams(window.location.search).get("error") === "signups_closed") {
      setError("Sign-ups are closed on this instance — sign in if you already have an account here.");
    }
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/auth/${mode}`, {
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
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("could not reach the server");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-xl sm:p-10">
      <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-base font-bold text-background shadow-lg shadow-accent/30 lg:hidden">
        D
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">
        {mode === "login" ? "Welcome back" : "Create your account"}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {mode === "login"
          ? "Sign in to deploy and monitor your apps."
          : "Start deploying from GitHub in minutes."}
      </p>

      {githubOAuth ? (
        <>
          <a
            href={`${API_URL}/auth/github/login`}
            className="mt-7 flex w-full items-center justify-center gap-2.5 rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 active:scale-[0.99]"
          >
            <Github className="h-4 w-4" strokeWidth={2} />
            Continue with GitHub
          </a>
          <p className="mt-2 text-center text-xs text-muted/80">
            Also connects the repos you deploy
          </p>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[11px] uppercase tracking-widest text-muted">
              or with email
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
        </>
      ) : null}

      <form onSubmit={handleSubmit} className={`space-y-3 ${githubOAuth ? "" : "mt-7"}`}>
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
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            placeholder="Password"
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
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground shadow-lg shadow-accent/20 transition hover:brightness-110 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        {mode === "login" ? "New to Deplyr?" : "Already have an account?"}{" "}
        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError(null);
          }}
          className="font-medium text-accent hover:underline"
        >
          {mode === "login" ? "Create an account" : "Sign in"}
        </button>
      </p>
    </div>
  );
}
