"use client";

import { ServerProjects } from "@/components/servers/server-projects";
import { useServer } from "@/components/servers/server-context";

export default function ServerProjectsTab() {
  const { server, online } = useServer();
  return <ServerProjects serverId={server.id} online={online} />;
}
