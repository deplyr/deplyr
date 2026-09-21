import type { SecretSummary } from "@deplyr/shared-types";
import { SecretsForm } from "@/components/secrets/secrets-form";
import { Page, PageHeader } from "@/components/ui/page";
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
    <Page width="narrow">
      <PageHeader
        back={{ href: `/projects/${id}`, label: "Back to project" }}
        eyebrow="Secrets"
        title="Environment variables"
        description="Values your app needs — encrypted at rest and injected as environment variables at deploy time."
      />
      <SecretsForm projectId={id} initialSecrets={secrets} />
    </Page>
  );
}
