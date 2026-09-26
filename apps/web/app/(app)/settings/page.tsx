import type { AuthUser } from "@deplyr/shared-types";
import { Github, UserRound } from "lucide-react";
import { GithubConnect } from "@/components/github/github-connect";
import { FlatCard } from "@/components/ui/flat-card";
import { Page, PageHeader } from "@/components/ui/page";
import { SectionTitle } from "@/components/ui/section-title";
import { FormError } from "@/components/ui/field";
import { apiFetch } from "@/lib/api";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ github?: string }>;
}) {
  const { github } = await searchParams;
  const [meRes, cfgRes] = await Promise.all([apiFetch("/auth/me"), apiFetch("/auth/config")]);
  const user: AuthUser | null = meRes.ok ? await meRes.json() : null;
  const cfg: { githubOAuth: boolean } = cfgRes.ok ? await cfgRes.json() : { githubOAuth: false };

  return (
    <Page width="narrow">
      <PageHeader eyebrow="Settings" title="Account" description="Your profile and connected services." />

      <FlatCard className="animate-fade-up p-6 sm:p-8">
        <SectionTitle icon={UserRound}>Profile</SectionTitle>
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 font-mono text-xl font-semibold text-accent">
            {(user?.githubLogin ?? user?.email ?? "?").charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold">{user?.githubLogin ?? user?.email}</p>
            <p className="truncate text-sm text-muted">{user?.email}</p>
          </div>
        </div>
      </FlatCard>

      <FlatCard className="animate-fade-up p-6 sm:p-8" style={{ animationDelay: "70ms" }}>
        <SectionTitle icon={Github}>GitHub</SectionTitle>
        <p className="mb-5 text-sm leading-relaxed text-muted">
          Lets Deplyr read the repositories you choose to deploy.
        </p>
        {github === "taken" ? (
          <div className="mb-4">
            <FormError>That GitHub account is already linked to another Deplyr user.</FormError>
          </div>
        ) : null}
        <GithubConnect githubLogin={user?.githubLogin ?? null} oauthEnabled={cfg.githubOAuth} />
      </FlatCard>
    </Page>
  );
}
