"use client";

import { ActivityLog } from "@/components/activity/activity-log";
import { Page, PageHeader } from "@/components/ui/page";

export default function ActivityPage() {
  return (
    <Page width="wide">
      <PageHeader
        eyebrow="Workspace"
        title="Activity"
        description="Every deploy, database change, install and alert across every server and project you own."
      />
      {/* No FlatCard wrapper — the table variant already supplies its own
          bordered box (see ActivityTable), edge to edge like a real log
          table, not inset inside a second card. */}
      <ActivityLog limit={30} showServer variant="table" />
    </Page>
  );
}
