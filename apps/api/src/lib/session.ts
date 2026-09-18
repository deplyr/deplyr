import { sign, verify } from "hono/jwt";

/**
 * Stateless session: a JWT holding just the user id, signed with
 * ARGO_SESSION_SECRET and stored in an httpOnly cookie. No sessions table —
 * revocation isn't a Phase 1 concern (logout just clears the cookie).
 */

export const SESSION_COOKIE = "argo_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function sessionSecret(): string {
  const secret = process.env.ARGO_SESSION_SECRET;
  if (!secret) throw new Error("ARGO_SESSION_SECRET is not set");
  return secret;
}

export async function createSessionToken(userId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    { sub: userId, iat: now, exp: now + SESSION_TTL_SECONDS },
    sessionSecret(),
  );
}

export async function verifySessionToken(token: string): Promise<string | null> {
  try {
    const payload = await verify(token, sessionSecret(), "HS256");
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
