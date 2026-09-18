import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { db, users, encryptSecret } from "@argo/db";
import { eq } from "drizzle-orm";
import type { AuthUser } from "@argo/shared-types";
import { SESSION_COOKIE, createSessionToken } from "../lib/session";
import { requireAuth } from "../lib/require-auth";
import type { AppEnv } from "../types";

const STATE_COOKIE = "argo_oauth_state";
// One OAuth grant covers both control-plane login and GitHub repo access —
// see docs/PHASE1_DESIGN.md section 4 (PR2).
const GITHUB_SCOPES = "read:user user:email repo";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export const authRoute = new Hono<AppEnv>();

authRoute.get("/github/login", (c) => {
  const state = crypto.randomUUID();
  setCookie(c, STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "Lax",
    maxAge: 600,
    path: "/",
  });

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", requiredEnv("GITHUB_CLIENT_ID"));
  url.searchParams.set("redirect_uri", requiredEnv("GITHUB_OAUTH_REDIRECT_URI"));
  url.searchParams.set("scope", GITHUB_SCOPES);
  url.searchParams.set("state", state);

  return c.redirect(url.toString());
});

authRoute.get("/github/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const expectedState = getCookie(c, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, { path: "/" });

  if (!code || !state || !expectedState || state !== expectedState) {
    return c.json({ error: "invalid OAuth state" }, 400);
  }

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: requiredEnv("GITHUB_CLIENT_ID"),
      client_secret: requiredEnv("GITHUB_CLIENT_SECRET"),
      code,
      redirect_uri: requiredEnv("GITHUB_OAUTH_REDIRECT_URI"),
    }),
  });
  const tokenBody = (await tokenRes.json()) as {
    access_token?: string;
    error_description?: string;
  };
  if (!tokenBody.access_token) {
    return c.json({ error: tokenBody.error_description ?? "GitHub OAuth failed" }, 400);
  }
  const accessToken = tokenBody.access_token;

  const ghHeaders = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "argo-control-plane",
  };

  const [profileRes, emailsRes] = await Promise.all([
    fetch("https://api.github.com/user", { headers: ghHeaders }),
    fetch("https://api.github.com/user/emails", { headers: ghHeaders }),
  ]);
  const profile = (await profileRes.json()) as { id: number; login: string };
  const emails = (await emailsRes.json()) as Array<{
    email: string;
    primary: boolean;
    verified: boolean;
  }>;
  const primaryEmail = emails.find((e) => e.primary && e.verified) ?? emails[0];
  if (!profile.id || !primaryEmail) {
    return c.json({ error: "could not read GitHub profile" }, 400);
  }

  const githubId = String(profile.id);
  const [user] = await db
    .insert(users)
    .values({
      email: primaryEmail.email,
      githubId,
      githubLogin: profile.login,
      githubAccessToken: encryptSecret(accessToken),
    })
    .onConflictDoUpdate({
      target: users.githubId,
      set: {
        email: primaryEmail.email,
        githubLogin: profile.login,
        githubAccessToken: encryptSecret(accessToken),
      },
    })
    .returning();

  if (!user) {
    return c.json({ error: "failed to create user" }, 500);
  }

  const sessionToken = await createSessionToken(user.id);
  setCookie(c, SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "Lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });

  return c.redirect(requiredEnv("WEB_URL"));
});

authRoute.get("/me", requireAuth, async (c) => {
  const userId = c.get("userId") as string;
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return c.json({ error: "not found" }, 404);

  const body: AuthUser = { id: user.id, email: user.email, githubLogin: user.githubLogin };
  return c.json(body);
});

authRoute.post("/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});
