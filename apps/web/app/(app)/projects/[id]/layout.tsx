"use client";

import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { ProjectProvider } from "@/components/projects/project-context";
import { ProjectShell } from "@/components/projects/project-shell";

// Every page under /projects/[id] — overview, deployments, environment, logs,
// settings, a single deploy — shares this hero and tab bar.
export default function ProjectLayout({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  return (
    <ProjectProvider id={id}>
      <ProjectShell>{children}</ProjectShell>
    </ProjectProvider>
  );
}
