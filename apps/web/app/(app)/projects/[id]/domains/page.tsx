"use client";

import { ProjectDomains } from "@/components/domains/project-domains";
import { useProject } from "@/components/projects/project-context";

export default function ProjectDomainsTab() {
  const { project } = useProject();
  return <ProjectDomains projectId={project.id} />;
}
