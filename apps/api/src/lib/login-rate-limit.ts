// Naive in-process brute-force guard for /auth/login. Fine for a single
// self-hosted instance (the only deployment shape this repo currently
// supports — one api process) but resets on restart and doesn't share state
// across processes; move this to Redis if the api is ever horizontally
// scaled.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

interface Entry {
  count: number;
  firstAttemptAt: number;
}

const attempts = new Map<string, Entry>();

/** Keyed by IP + the email being attempted, not just IP — a shared office
 * IP shouldn't get locked out over someone else guessing a different
 * account, and this still stops the same attacker sweeping many passwords
 * against one email. */
export function loginAttemptKey(ip: string, email: string): string {
  return `${ip}:${email.toLowerCase()}`;
}

function sweep(now: number): void {
  for (const [key, entry] of attempts) {
    if (now - entry.firstAttemptAt > WINDOW_MS) attempts.delete(key);
  }
}

export function isLoginLocked(key: string): boolean {
  const now = Date.now();
  sweep(now);
  const entry = attempts.get(key);
  return Boolean(entry && entry.count >= MAX_ATTEMPTS && now - entry.firstAttemptAt < WINDOW_MS);
}

export function recordFailedLogin(key: string): void {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.firstAttemptAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAttemptAt: now });
  } else {
    entry.count += 1;
  }
}

export function clearLoginAttempts(key: string): void {
  attempts.delete(key);
}
