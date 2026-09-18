import { cookies } from "next/headers";

// Server-to-server URL (Server Components, Route Handlers). In
// docker-compose.prod.yml this is the internal service name
// (http://api:4000); NEXT_PUBLIC_API_URL is the public one the browser
// itself talks to (form submits, polling).
const API_URL = process.env.API_URL ?? "http://localhost:4000";

/**
 * Fetch from a Server Component, forwarding the incoming request's cookies.
 * Needed because this request originates from the Next.js server process,
 * not the browser, so it doesn't automatically carry the session cookie
 * the way a same-host browser request would.
 */
export async function apiFetch(path: string, init: RequestInit = {}) {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: { ...init.headers, cookie: cookieHeader },
    cache: "no-store",
  });
}
