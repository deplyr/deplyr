import { Boxes } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export default function ProjectsPage() {
  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-lg font-semibold">Projects</h1>
        <p className="mt-1 text-sm text-muted">
          Apps deployed from a GitHub repo.
        </p>
      </header>

      <EmptyState
        icon={Boxes}
        title="No projects yet"
        description="Connect a GitHub repo and a server to deploy your first project."
      />
    </div>
  );
}
