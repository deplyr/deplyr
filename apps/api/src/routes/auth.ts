import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { db, users, encryptSecret } from "@deplyr/db";
import { eq, ne, and, sql } from "drizzle-orm";
import { credentialsInputSchema, type AuthUser } from "@deplyr/shared-types";
import { SESSION_COOKIE, createSessionToken, verifySessionToken } from "../lib/session";
import { requireAuth } from "../lib/require-auth";
import { ensureLocalServerSafely } from "../lib/local-server";
import { clearLoginAttempts, isLoginLocked, loginAttemptKey, recordFailedLogin } from "../lib/login-rate-limit";
import type { AppEnv } from "../types";

const STATE_COOKIE = "deplyr_oauth_state";
// One OAuth grant covers both control-plane login and GitHub repo access —
// see docs/architecture.md (PR2).
const GITHUB_SCOPES = "read:user user:email repo";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/** Best effort — trusts Caddy's X-Forwarded-For in front of this, falls
 * back to "unknown" (one shared bucket) for direct/local connections where
 * nothing sets it, e.g. local dev. */
function clientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return c.req.header("x-real-ip") ?? "unknown";
}

export const authRoute = new Hono<AppEnv>();

// Tells the UI which sign-in options this instance supports. Cloud has
// GitHub OAuth configured and always has users; a fresh self-hosted
// install may have neither, and falls back to the setup flow + PAT.
//
// DEPLYR_CLOUD_MODE pins needsSetup to false regardless of user count: a
// hosted multi-tenant instance always shows the normal login screen (and
// its "Continue with GitHub" button), never the single-admin setup wizard
// that's meant for a fresh self-hosted box's first run.
authRoute.get("/config", async (c) => {
  const cloudMode = process.env.DEPLYR_CLOUD_MODE === "true";
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
  return c.json({
    githubOAuth: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
    needsSetup: cloudMode ? false : (row?.count ?? 0) === 0,
  });
});

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
    "User-Agent": "deplyr-control-plane",
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

  // Already signed in (e.g. an email/password account connecting GitHub):
  // attach to that account instead of creating a second one.
  const sessionCookie = getCookie(c, SESSION_COOKIE);
  const sessionUserId = sessionCookie ? await verifySessionToken(sessionCookie) : null;
  if (sessionUserId) {
    const [owner] = await db.select().from(users).where(eq(users.githubId, githubId));
    if (owner && owner.id !== sessionUserId) {
      return c.redirect(`${requiredEnv("WEB_URL")}/settings?github=taken`);
    }
    await db
      .update(users)
      .set({ githubId, githubLogin: profile.login, githubAccessToken: encryptSecret(accessToken) })
      .where(eq(users.id, sessionUserId));
    return c.redirect(`${requiredEnv("WEB_URL")}/settings?github=connected`);
  }

  const encryptedToken = encryptSecret(accessToken);
  const githubFields = { githubId, githubLogin: profile.login, githubAccessToken: encryptedToken };

  // 1) returning GitHub user, 2) existing password account with the same
  // *verified* email (link it — GitHub proved the address), 3) brand new.
  let user: typeof users.$inferSelect | undefined;
  const [byGithubId] = await db.select().from(users).where(eq(users.githubId, githubId));
  if (byGithubId) {
    [user] = await db
      .update(users)
      .set({ githubLogin: profile.login, githubAccessToken: encryptedToken })
      .where(eq(users.id, byGithubId.id))
      .returning();
  } else {
    const [byEmail] = await db.select().from(users).where(eq(users.email, primaryEmail.email));
    if (byEmail) {
      if (!primaryEmail.verified) {
        return c.json({ error: "verify your email on GitHub, then try again" }, 400);
      }
      [user] = await db.update(users).set(githubFields).where(eq(users.id, byEmail.id)).returning();
    } else {
      // Same cap as /auth/signup, enforced here too — GitHub OAuth was the
      // one path that could still mint a second account on a self-hosted
      // instance regardless of it.
      const cloudMode = process.env.DEPLYR_CLOUD_MODE === "true";
      if (!cloudMode) {
        const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
        if ((row?.count ?? 0) > 0) {
          return c.redirect(`${requiredEnv("WEB_URL")}/login?error=signups_closed`);
        }
      }
      [user] = await db
        .insert(users)
        .values({ email: primaryEmail.email, ...githubFields })
        .returning();
    }
  }

  if (!user) {
    return c.json({ error: "failed to create user" }, 500);
  }
  ensureLocalServerSafely();

  const sessionToken = await createSessionToken(user.id);
  setCookie(c, SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "Lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });

  return c.redirect(requiredEnv("WEB_URL"));
});

authRoute.post("/signup", async (c) => {
  // Mirrors /auth/config's needsSetup exactly, but enforced here — that
  // endpoint only ever told the *frontend* whether to show a signup form;
  // nothing stopped this one from being called directly regardless. On a
  // self-hosted instance, sign-ups are for creating the one admin account
  // during first-run setup, full stop.
  const cloudMode = process.env.DEPLYR_CLOUD_MODE === "true";
  if (!cloudMode) {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
    if ((row?.count ?? 0) > 0) {
      return c.json({ error: "sign-ups are closed on this instance" }, 403);
    }
  }

  const parsed = credentialsInputSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "invalid input" }, 400);
  }
  const { email, password } = parsed.data;

  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) {
    return c.json({ error: "an account with that email already exists" }, 409);
  }

  const passwordHash = await Bun.password.hash(password);
  const [user] = await db.insert(users).values({ email, passwordHash }).returning();
  if (!user) {
    return c.json({ error: "failed to create user" }, 500);
  }

  ensureLocalServerSafely();

  const sessionToken = await createSessionToken(user.id);
  setCookie(c, SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "Lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });

  const body: AuthUser = { id: user.id, email: user.email, githubLogin: user.githubLogin };
  return c.json(body, 201);
});

authRoute.post("/login", async (c) => {
  const parsed = credentialsInputSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "invalid input" }, 400);
  }
  const { email, password } = parsed.data;

  const attemptKey = loginAttemptKey(clientIp(c), email);
  if (isLoginLocked(attemptKey)) {
    return c.json({ error: "too many attempts — try again in a few minutes" }, 429);
  }

  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user || !user.passwordHash || !(await Bun.password.verify(password, user.passwordHash))) {
    recordFailedLogin(attemptKey);
    return c.json({ error: "incorrect email or password" }, 401);
  }
  clearLoginAttempts(attemptKey);

  const sessionToken = await createSessionToken(user.id);
  setCookie(c, SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "Lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });

  const body: AuthUser = { id: user.id, email: user.email, githubLogin: user.githubLogin };
  return c.json(body);
});

// Personal-access-token alternative to OAuth — lets a self-hosted instance
// connect GitHub without registering an OAuth App or having a public
// callback URL. Classic tokens need `repo`; fine-grained tokens need read
// access to Contents + Metadata.
authRoute.post("/github/token", requireAuth, async (c) => {
  const userId = c.get("userId") as string;
  const body = (await c.req.json().catch(() => null)) as { token?: string } | null;
  const token = body?.token?.trim();
  if (!token) return c.json({ error: "token is required" }, 400);

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "deplyr-control-plane",
  };
  const profileRes = await fetch("https://api.github.com/user", { headers });
  if (profileRes.status === 401) {
    return c.json({ error: "GitHub rejected this token — check it was copied in full" }, 400);
  }
  if (!profileRes.ok) return c.json({ error: "could not reach GitHub" }, 502);
  const profile = (await profileRes.json()) as { id: number; login: string };

  // Classic tokens report their scopes; fine-grained ones don't, so probe.
  const scopes = profileRes.headers.get("x-oauth-scopes");
  if (scopes !== null && !scopes.split(",").map((x) => x.trim()).includes("repo")) {
    return c.json({ error: "token is missing the `repo` scope" }, 400);
  }
  const reposRes = await fetch("https://api.github.com/user/repos?per_page=1", { headers });
  if (!reposRes.ok) {
    return c.json({ error: "token can't read repositories — grant Contents (read) access" }, 400);
  }

  const githubId = String(profile.id);
  const [owner] = await db
    .select()
    .from(users)
    .where(and(eq(users.githubId, githubId), ne(users.id, userId)));

  await db
    .update(users)
    .set({
      githubLogin: profile.login,
      githubAccessToken: encryptSecret(token),
      ...(owner ? {} : { githubId }),
    })
    .where(eq(users.id, userId));

  return c.json({ githubLogin: profile.login });
});

authRoute.delete("/github/token", requireAuth, async (c) => {
  const userId = c.get("userId") as string;
  await db
    .update(users)
    .set({ githubAccessToken: null, githubLogin: null, githubId: null })
    .where(eq(users.id, userId));
  return c.json({ ok: true });
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
