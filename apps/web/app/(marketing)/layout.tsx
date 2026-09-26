import type { ReactNode } from "react";
import type { AuthUser } from "@deplyr/shared-types";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { apiFetch } from "@/lib/api";

async function getCurrentUser(): Promise<AuthUser | null> {
  const res = await apiFetch("/auth/me");
  if (!res.ok) return null;
  return res.json();
}

// The two routes reachable without a session (see middleware.ts): the
// landing page and the public docs. A signed-in visitor can still land on
// /docs (it isn't a guest-only route), so the header checks auth itself
// rather than assuming everyone here is logged out.
export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader user={user} />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
