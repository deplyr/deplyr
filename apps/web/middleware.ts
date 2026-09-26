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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
