import { Settings } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          Account and notification preferences.
        </p>
      </header>

      <EmptyState
        icon={Settings}
        title="Nothing to configure yet"
        description="Account and Slack notification settings will show up here."
      />
    </div>
  );
}
