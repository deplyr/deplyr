import { Server } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export default function ServersPage() {
  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-lg font-semibold">Servers</h1>
        <p className="mt-1 text-sm text-muted">
          VPS instances Argo can deploy to.
        </p>
      </header>

      <EmptyState
        icon={Server}
        title="No servers yet"
        description="Paste a VPS IP and root credentials to get started. Argo handles Docker, the agent install, and health checks for you."
      />
    </div>
  );
}
