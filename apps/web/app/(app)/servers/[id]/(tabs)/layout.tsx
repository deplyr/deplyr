"use client";

import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { ServerProvider } from "@/components/servers/server-context";
import { ServerShell } from "@/components/servers/server-shell";

// One server, several tabs. The provider and shell live here so they persist
// across tab switches: the server keeps polling and the hero never re-renders
// from scratch. (The database detail page sits outside this group on purpose —
// it's a full page of its own, not a section of the server.)
export default function ServerTabsLayout({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  return (
    <ServerProvider id={id}>
      <ServerShell>{children}</ServerShell>
    </ServerProvider>
  );
}
