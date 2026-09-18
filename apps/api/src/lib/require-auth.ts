import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import type { AppEnv } from "../types";
import { SESSION_COOKIE, verifySessionToken } from "./session";

/** Attaches `userId` to context on a valid session cookie, else 401s. */
export async function requireAuth(c: Context<AppEnv>, next: Next) {
  const token = getCookie(c, SESSION_COOKIE);
  const userId = token ? await verifySessionToken(token) : null;

  if (!userId) {
    return c.json({ error: "not authenticated" }, 401);
  }

  c.set("userId", userId);
  await next();
}
