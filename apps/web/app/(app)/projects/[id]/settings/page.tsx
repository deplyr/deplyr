"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Check, FolderSearch, Info, Loader2, Rocket, Sparkles, Wand2 } from "lucide-react";
import {
  NODE_VERSIONS,
  resolveBuildPlan,
  type DetectionResult,
  type Framework,
  type PackageManager,
  type ProjectSettings,
  type ProjectSummary,
} from "@deplyr/shared-types";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, FormError, inputClass } from "@/components/ui/field";
import { GlassCard } from "@/components/ui/glass-card";
import { Page, PageHeader } from "@/components/ui/page";
import { SectionTitle } from "@/components/ui/section-title";
import { cn } from "@/lib/cn";
import { handleGithubExpired } from "@/lib/github-expired";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const FRAMEWORKS: Array<{ value: Framework; label: string; hint: string }> = [
  { value: "nextjs", label: "Next.js", hint: "next build → next start" },
  { value: "nestjs", label: "NestJS", hint: "nest build → node dist/main" },
  { value: "node", label: "Node.js", hint: "Express, Fastify, plain scripts" },
  { value: "dockerfile", label: "Dockerfile", hint: "Build and run your own image" },
];
const PACKAGE_MANAGERS: PackageManager[] = ["npm", "pnpm", "yarn", "bun"];

/** A command field has three states: use the default, custom text, or skip the step. */
type Cmd = { mode: "default" | "custom" | "skip"; text: string };
const toCmd = (v: string | undefined): Cmd => (v === undefined ? { mode: "default", text: "" } : v.trim() === "" ? { mode: "skip", text: "" } : { mode: "custom", text: v });
const fromCmd = (c: Cmd): string | undefined => (c.mode === "skip" ? "" : c.mode === "custom" && c.text.trim() ? c.text.trim() : undefined);

function CommandField({
  label,
  value,
  onChange,
  placeholder,
  canSkip,
}: {
  label: string;
  value: Cmd;
  onChange: (c: Cmd) => void;
  placeholder: string;
  canSkip: boolean;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        {canSkip ? (
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
            <input
              type="checkbox"
              checked={value.mode === "skip"}
              onChange={(e) => onChange(e.target.checked ? { mode: "skip", text: "" } : { mode: value.text ? "custom" : "default", text: value.text })}
              className="h-3.5 w-3.5 accent-[#22D3EE]"
            />
            Skip this step
          </label>
        ) : null}
      </div>
      <input
        value={value.mode === "skip" ? "" : value.text}
        disabled={value.mode === "skip"}
        onChange={(e) => onChange({ mode: e.target.value ? "custom" : "default", text: e.target.value })}
        placeholder={value.mode === "skip" ? "skipped" : placeholder}
        spellCheck={false}
        className={cn(inputClass, "font-mono text-xs")}
      />
    </div>
  );
}

export default function ProjectSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [detected, setDetected] = useState<DetectionResult | null>(null);
  const [detecting, setDetecting] = useState(false);

  const [framework, setFramework] = useState<Framework | "">("");
  const [rootDir, setRootDir] = useState("");
  const [pm, setPm] = useState<PackageManager>("npm");
  const [nodeVersion, setNodeVersion] = useState<string>("20");
  const [install, setInstall] = useState<Cmd>({ mode: "default", text: "" });
  const [build, setBuild] = useState<Cmd>({ mode: "default", text: "" });
  const [start, setStart] = useState<Cmd>({ mode: "default", text: "" });
  const [health, setHealth] = useState("/");
  const [dockerfile, setDockerfile] = useState("Dockerfile");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`${API_URL}/projects/${id}`, { credentials: "include" });
    if (!res.ok) return;
    const p: ProjectSummary = await res.json();
    setProject(p);
    const s = p.settings ?? {};
    setFramework(p.framework ?? "");
    setRootDir(s.rootDir ?? "");
    setPm(s.packageManager ?? "npm");
    setNodeVersion(s.nodeVersion ?? "20");
    setInstall(toCmd(s.installCommand));
    setBuild(toCmd(s.buildCommand));
    setStart(toCmd(s.startCommand));
    setHealth(s.healthCheckPath ?? "/");
    setDockerfile(s.dockerfilePath ?? "Dockerfile");
  }, [id]);

  const detect = useCallback(
    async (folder?: string) => {
      setDetecting(true);
      try {
        const res = await fetch(`${API_URL}/projects/${id}/detect`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(folder === undefined ? {} : { rootDir: folder }),
        });
        if (res.ok) {
          setDetected(await res.json());
        } else {
          const body = await res.json().catch(() => null);
          if (!handleGithubExpired(body)) setError(body?.error ?? "Couldn't check the repository.");
        }
      } finally {
        setDetecting(false);
      }
    },
    [id],
  );

  useEffect(() => {
    load().then(() => detect());
  }, [load, detect]);

  const current: ProjectSettings = useMemo(
    () => ({
      ...(rootDir.trim() ? { rootDir: rootDir.trim() } : {}),
      packageManager: pm,
      nodeVersion: nodeVersion as ProjectSettings["nodeVersion"],
      installCommand: fromCmd(install),
      buildCommand: fromCmd(build),
      startCommand: fromCmd(start),
      healthCheckPath: health.trim() || "/",
      ...(dockerfile.trim() && dockerfile.trim() !== "Dockerfile" ? { dockerfilePath: dockerfile.trim() } : {}),
    }),
    [rootDir, pm, nodeVersion, install, build, start, health, dockerfile],
  );

  const fw = framework === "" ? null : framework;
  const plan = useMemo(() => resolveBuildPlan(fw, current), [fw, current]);
  const defaults = useMemo(
    () => ({
      install: resolveBuildPlan(fw, { ...current, installCommand: undefined }).install ?? "",
      build: resolveBuildPlan(fw, { ...current, buildCommand: undefined }).build ?? "",
      start: resolveBuildPlan(fw, { ...current, startCommand: undefined }).start,
    }),
    [fw, current],
  );

  function applyDetected() {
    if (!detected?.framework) return;
    const s = detected.settings;
    setFramework(detected.framework);
    setPm(s.packageManager ?? "npm");
    setNodeVersion(s.nodeVersion ?? "20");
    setInstall(toCmd(s.installCommand));
    setBuild(toCmd(s.buildCommand));
    setStart(toCmd(s.startCommand));
    setSaved(false);
  }

  async function save() {
    if (!fw) return setError("Choose how this project is built first.");
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`${API_URL}/projects/${id}/settings`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ framework: fw, settings: current }),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => null))?.error ?? "Couldn't save settings.");
        return;
      }
      setProject(await res.json());
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  if (!project) {
    return (
      <Page width="narrow">
        <div className="h-48 animate-pulse rounded-2xl bg-white/[0.04]" />
      </Page>
    );
  }

  const isDocker = fw === "dockerfile";
  const differs = detected?.framework && (detected.framework !== fw || detected.settings.packageManager !== pm);

  return (
    <Page width="narrow">
      <PageHeader
        back={{ href: `/projects/${id}`, label: project.name }}
        eyebrow="Build settings"
        title="How this app is built and run"
        description="Deplyr works this out from your repo. Change anything that's wrong — it takes effect on the next deploy."
      />

      {detected?.notes.length ? (
        <GlassCard className="animate-fade-up" innerClassName="p-5">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={1.75} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {detected.framework ? `Detected ${FRAMEWORKS.find((f) => f.value === detected.framework)?.label}` : "Couldn't detect a supported app here"}
              </p>
              <ul className="mt-1.5 space-y-1">
                {detected.notes.map((n) => (
                  <li key={n} className="flex gap-2 text-xs leading-relaxed text-muted">
                    <Info className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={1.75} />
                    {n}
                  </li>
                ))}
              </ul>
            </div>
            {differs ? (
              <Button variant="secondary" onClick={applyDetected} className="shrink-0 !px-3 !py-1.5 text-xs">
                <Wand2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                Use detected
              </Button>
            ) : null}
          </div>
        </GlassCard>
      ) : null}

      <GlassCard className="animate-fade-up" style={{ animationDelay: "50ms" }} innerClassName="space-y-6 p-6 sm:p-8">
        <div>
          <SectionTitle>Type</SectionTitle>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {FRAMEWORKS.map((f) => {
              const active = f.value === fw;
              const unavailable = f.value === "dockerfile" && !detected?.hasDockerfile && !active;
              return (
                <button
                  key={f.value}
                  type="button"
                  disabled={unavailable}
                  onClick={() => setFramework(f.value)}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-3.5 text-left transition disabled:cursor-not-allowed disabled:opacity-40",
                    active ? "border-accent/60 bg-accent/10 ring-4 ring-accent/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{f.label}</span>
                    <span className="block font-mono text-[11px] text-muted">{unavailable ? "no Dockerfile found in this folder" : f.hint}</span>
                  </span>
                  {active ? <Check className="h-4 w-4 text-accent" strokeWidth={2.5} /> : null}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <Field label="Root directory" hint="Leave blank if the app is at the top of the repo. For a monorepo, the folder holding it — e.g. apps/web.">
            <div className="flex gap-2">
              <input value={rootDir} onChange={(e) => setRootDir(e.target.value)} placeholder="(repository root)" spellCheck={false} className={cn(inputClass, "font-mono text-xs")} />
              <Button type="button" variant="secondary" onClick={() => detect(rootDir.trim())} disabled={detecting} className="shrink-0">
                {detecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderSearch className="h-4 w-4" strokeWidth={1.75} />}
                Check
              </Button>
            </div>
          </Field>
        </div>

        {isDocker ? (
          <Field label="Dockerfile path" hint="Relative to the root directory. Your app must listen on the PORT environment variable.">
            <input value={dockerfile} onChange={(e) => setDockerfile(e.target.value)} spellCheck={false} className={cn(inputClass, "font-mono text-xs")} />
          </Field>
        ) : (
          <>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Package manager">
                <select value={pm} onChange={(e) => setPm(e.target.value as PackageManager)} className={inputClass}>
                  {PACKAGE_MANAGERS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Node version" hint={pm === "bun" ? "Bun uses its own runtime image." : undefined}>
                <select value={nodeVersion} onChange={(e) => setNodeVersion(e.target.value)} disabled={pm === "bun"} className={inputClass}>
                  {NODE_VERSIONS.map((v) => (
                    <option key={v} value={v}>
                      Node {v}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="space-y-4">
              <CommandField label="Install command" value={install} onChange={setInstall} placeholder={defaults.install} canSkip />
              <CommandField label="Build command" value={build} onChange={setBuild} placeholder={defaults.build || "(no build step)"} canSkip />
              <CommandField label="Start command" value={start} onChange={setStart} placeholder={defaults.start} canSkip={false} />
            </div>
          </>
        )}

        <Field label="Health check path" hint="Deplyr requests this after each deploy and expects a 2xx. Use /api/health if / redirects or needs a login.">
          <input value={health} onChange={(e) => setHealth(e.target.value)} className={cn(inputClass, "font-mono text-xs")} />
        </Field>
      </GlassCard>

      {/* what will actually run */}
      <GlassCard className="animate-fade-up" style={{ animationDelay: "90ms" }} innerClassName="p-6">
        <SectionTitle>What will run</SectionTitle>
        <dl className="space-y-2.5 font-mono text-xs">
          {isDocker ? (
            <>
              <Row k="build" v={`docker build -f ${plan.rootDir ? `${plan.rootDir}/` : ""}${plan.dockerfilePath} .`} />
              <Row k="run" v="docker run --network host -e PORT=… <image>" />
            </>
          ) : (
            <>
              <Row k="image" v={plan.image} />
              <Row k="install" v={plan.install ?? "— skipped"} />
              <Row k="build" v={plan.build ?? "— skipped"} />
              <Row k="start" v={plan.start} />
            </>
          )}
          <Row k="health" v={`GET ${plan.healthCheckPath}`} />
        </dl>
        <p className="mt-4 text-xs leading-relaxed text-muted">
          Your secrets are available while building and running. The port is set for you in <code className="font-mono text-foreground">PORT</code> — make sure the app listens on it.
        </p>
      </GlassCard>

      {error ? <FormError>{error}</FormError> : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={saving || !fw}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {saving ? "Saving…" : "Save settings"}
        </Button>
        {saved ? (
          <>
            <span className="flex items-center gap-1.5 text-sm text-success">
              <Check className="h-4 w-4" strokeWidth={2.5} />
              Saved — applies on the next deploy
            </span>
            <Link href={`/projects/${id}`} className={buttonClass("secondary")}>
              <Rocket className="h-4 w-4" strokeWidth={1.75} />
              Back to project
            </Link>
          </>
        ) : null}
      </div>
    </Page>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-4">
      <dt className="w-14 shrink-0 text-muted">{k}</dt>
      <dd className="min-w-0 break-all text-foreground">{v}</dd>
    </div>
  );
}
