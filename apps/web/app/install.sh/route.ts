import { after } from "next/server";
import type { NextRequest } from "next/server";

// Always run: every request is an install attempt, and a cached response
// would hide it from the count.
export const dynamic = "force-dynamic";

const SCRIPT_URL = "https://raw.githubusercontent.com/deplyr/deplyr/main/infra/install.sh";
const UMAMI_URL = "https://cloud.umami.is/api/send";
const UMAMI_WEBSITE_ID = "48cb65b2-6169-40b4-ad2d-f90c136ab84c";

/**
 * `curl -fsSL https://deplyr.abhilaksharora.com/install.sh | bash`
 *
 * Serves the installer from GitHub (always the latest main) and counts the
 * request as an "install-script" event in Umami. Nothing is collected from the
 * user's machine — the request itself is the only signal.
 */
export async function GET(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_MARKETING_ONLY === "1") {
    const userAgent = request.headers.get("user-agent") ?? "curl";
    after(async () => {
      await fetch(UMAMI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": userAgent },
        body: JSON.stringify({
          type: "event",
          payload: { website: UMAMI_WEBSITE_ID, hostname: request.nextUrl.hostname, url: "/install.sh", name: "install-script" },
        }),
      }).catch(() => {});
    });
  }

  const upstream = await fetch(SCRIPT_URL, { next: { revalidate: 300 } }).catch(() => null);
  if (!upstream?.ok) return Response.redirect(SCRIPT_URL, 302); // GitHub hiccup: still installable
  return new Response(upstream.body, {
    headers: { "Content-Type": "text/x-shellscript; charset=utf-8", "Cache-Control": "no-store" },
  });
}
