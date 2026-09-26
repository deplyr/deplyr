import Script from "next/script";
import type { ReactNode } from "react";
import type { AuthUser } from "@deplyr/shared-types";
import { MarketingBackground } from "@/components/marketing/marketing-background";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { apiFetch } from "@/lib/api";

async function getCurrentUser(): Promise<AuthUser | null> {
  // Landing-page-only deploy has no API to ask (and staying API-free keeps the pages static).
  if (process.env.NEXT_PUBLIC_MARKETING_ONLY === "1") return null;
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
    <div className="relative flex min-h-screen flex-col">
      {/* Analytics only on the public landing-page deploy — self-hosted
          instances stay telemetry-free. */}
      {process.env.NEXT_PUBLIC_MARKETING_ONLY === "1" ? (
        <>
          <Script defer src="https://cloud.umami.is/script.js" data-website-id="48cb65b2-6169-40b4-ad2d-f90c136ab84c" strategy="afterInteractive" />
          <Script defer src="https://argus-api.abhilaksharora.com/argus.js" data-site-id="go4psq4ghmh4" strategy="afterInteractive" />
        </>
      ) : null}
      <MarketingBackground />
      <SiteHeader user={user} />
      {/* min-w-0: flex items default to min-width:auto, so without this a
          wide descendant (the docs mobile pill-nav's own overflow-x-auto
          row) grows this flex item — and the whole page — to fit it instead
          of scrolling inside its own box. Classic flexbox overflow trap. */}
      <main className="min-w-0 flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
