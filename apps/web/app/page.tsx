import Link from "next/link";
import { Server } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-muted">
          An overview of your servers and live apps.
        </p>
      </header>

      <EmptyState
        icon={Server}
        title="No servers connected yet"
        description="Connect a VPS to start deploying. Argo installs everything it needs over SSH — you'll never need to open a terminal again."
        action={
          <Link href="/servers">
            <Button>Connect a server</Button>
          </Link>
        }
      />
    </div>
  );
}
