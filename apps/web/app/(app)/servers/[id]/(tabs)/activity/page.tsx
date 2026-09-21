"use client";

import { ListChecks } from "lucide-react";
import { ActivityLog } from "@/components/activity/activity-log";
import { useServer } from "@/components/servers/server-context";
import { GlassCard } from "@/components/ui/glass-card";
import { SectionTitle } from "@/components/ui/section-title";

export default function ServerActivityTab() {
  const { server } = useServer();
  return (
    <GlassCard className="animate-fade-up" innerClassName="p-6">
      <SectionTitle icon={ListChecks} meta="every action on this server">
        Activity log
      </SectionTitle>
      <ActivityLog serverId={server.id} limit={25} />
    </GlassCard>
  );
}
