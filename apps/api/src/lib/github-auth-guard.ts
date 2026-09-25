import type { Context } from "hono";
import { deleteCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { db, users } from "@deplyr/db";
import { SESSION_COOKIE } from "./session";
import type { AppEnv } from "../types";

/**
 * A GitHub call came back 401 (see GithubAuthError in ./github) — the
 * stored token is dead and there's no way to refresh it silently. Clear the
 * account's GitHub link so Settings stops claiming it's connected, and end
 * the session: the cleanest way back in is a full sign-in, which (via
 * "Continue with GitHub") re-establishes both the session and a fresh
 * token in one step, instead of leaving the user connected-but-broken.
 */
export async function invalidateGithubSession(c: Context<AppEnv>, userId: string) {
  await db
    .update(users)
    .set({ githubAccessToken: null, githubLogin: null, githubId: null })
    .where(eq(users.id, userId));
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ error: "github_expired", message: "Your GitHub connection expired — sign in again." }, 401);
}
