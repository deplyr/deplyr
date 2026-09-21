import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Kept in sync with apps/api/src/lib/session.ts's SESSION_COOKIE — this
// only checks presence (routing decision), the API is what actually
// verifies the JWT signature.
const SESSION_COOKIE = "deplyr_session";
const PUBLIC_PATHS = ["/login", "/setup"];
// Signed-in users get bounced off these; /setup stays reachable because its
// second step (connect GitHub) runs right after the account is created.
const GUEST_ONLY_PATHS = ["/login"];

export function middleware(request: NextRequest) {
  const isPublicPath = PUBLIC_PATHS.some((path) =>
    request.nextUrl.pathname.startsWith(path),
  );
  const hasSession = request.cookies.has(SESSION_COOKIE);

  if (!hasSession && !isPublicPath) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const isGuestOnly = GUEST_ONLY_PATHS.some((path) =>
    request.nextUrl.pathname.startsWith(path),
  );
  if (hasSession && isGuestOnly) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
