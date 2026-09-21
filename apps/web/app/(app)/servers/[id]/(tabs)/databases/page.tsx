"use client";

import { ServerDatabases } from "@/components/databases/server-databases";
import { useServer } from "@/components/servers/server-context";

export default function ServerDatabasesTab() {
  const { server, online } = useServer();
  return <ServerDatabases serverId={server.id} canCreate={online} />;
}
