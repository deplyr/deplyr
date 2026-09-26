import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Kept in sync with apps/api/src/lib/session.ts's SESSION_COOKIE — this
// only checks presence (routing decision), the API is what actually
// verifies the JWT signature.
const SESSION_COOKIE = "deplyr_session";
// Reachable without a session. "/" (the marketing landing page) is handled
// separately below — startsWith("/") here would swallow every other path.
const PUBLIC_PATHS = ["/login", "/setup", "/docs"];
// Bounced to the dashboard once already signed in — no reason to show a
// logged-in visitor the pitch, or the login form.
const GUEST_ONLY_PATHS = ["/login"];

// Set on the standalone landing-page deploy (Vercel): no API and no accounts
// there, so only the marketing pages exist and everything else goes home.
const MARKETING_ONLY = process.env.NEXT_PUBLIC_MARKETING_ONLY === "1";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (MARKETING_ONLY) {
    return pathname === "/" || pathname.startsWith("/docs") || pathname === "/install.sh" ? NextResponse.next() : NextResponse.redirect(new URL("/", request.url));
  }
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const isRoot = pathname === "/";
  const isPublicPath = isRoot || PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  if (!hasSession && !isPublicPath) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const isGuestOnly = isRoot || GUEST_ONLY_PATHS.some((path) => pathname.startsWith(path));
  if (hasSession && isGuestOnly) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Static/SEO files are excluded so crawlers and social scrapers (no session
  // cookie) get them instead of a redirect to /login.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml|install.sh|opengraph-image|twitter-image).*)"],
};
