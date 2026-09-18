import type { ReactNode } from "react";
import type { AuthUser } from "@argo/shared-types";
import { Sidebar } from "@/components/shell/sidebar";
import { apiFetch } from "@/lib/api";

async function getCurrentUser(): Promise<AuthUser | null> {
  const res = await apiFetch("/auth/me");
  if (!res.ok) return null;
  return res.json();
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-screen">
      <Sidebar user={user} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
