import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { SecretSummary } from "@argo/shared-types";
import { SecretsForm } from "@/components/secrets/secrets-form";
import { apiFetch } from "@/lib/api";

async function getSecrets(projectId: string): Promise<SecretSummary[]> {
  const res = await apiFetch(`/projects/${projectId}/secrets`);
  if (!res.ok) return [];
  return res.json();
}

export default async function ProjectSecretsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const secrets = await getSecrets(id);

  return (
    <div className="mx-auto max-w-lg px-8 py-10">
      <Link
        href={`/projects/${id}`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        Back to project
      </Link>

      <header className="mb-8">
        <h1 className="text-lg font-semibold">Secrets</h1>
        <p className="mt-1 text-sm text-muted">
          Values your app needs — injected as environment variables at
          deploy time.
        </p>
      </header>

      <SecretsForm projectId={id} initialSecrets={secrets} />
    </div>
  );
}
