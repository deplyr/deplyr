import type { ReactNode } from "react";
import type { AuthUser } from "@deplyr/shared-types";
import { AppShell } from "@/components/shell/app-shell";
import { AmbientBackground } from "@/components/shell/ambient-background";
import { apiFetch } from "@/lib/api";

import type { Metadata } from "next";

// Private per-instance pages — nothing here should ever show up in search.
export const metadata: Metadata = { robots: { index: false, follow: false } };

async function getCurrentUser(): Promise<AuthUser | null> {
  const res = await apiFetch("/auth/me");
  if (!res.ok) return null;
  return res.json();
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  return (
    <>
      <AmbientBackground />
      <AppShell user={user}>{children}</AppShell>
    </>
  );
}
