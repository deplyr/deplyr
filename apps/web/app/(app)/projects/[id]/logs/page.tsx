"use client";

import { ScrollText } from "lucide-react";
import { LogViewer } from "@/components/logs/log-viewer";
import { useProject } from "@/components/projects/project-context";
import { FlatCard } from "@/components/ui/flat-card";
import { SectionTitle } from "@/components/ui/section-title";

// Rendered inside the project layout's hero + tab bar, like its sibling tabs.
export default function ProjectLogsTab() {
  const { project } = useProject();
  return (
    <FlatCard className="animate-fade-up p-6">
      <SectionTitle icon={ScrollText} meta="read from the container, never stored">
        Application logs
      </SectionTitle>
      <LogViewer endpoint={`/projects/${project.id}/logs`} filename={project.name} />
    </FlatCard>
  );
}
