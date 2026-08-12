/**
 * Session cache for the seed / verify scripts.
 *
 * Nhost Auth rate-limits sign-in per IP, and these scripts authenticate four
 * accounts every run — so running them a few times in a row would start getting
 * HTTP 429 with an empty body, which looks exactly like "wrong password" if you
 * are not paying attention.
 *
 * So: cache each account's session on disk, reuse the access token while it is
 * still valid, fall back to the refresh token, and only sign in as a last
 * resort. A 429 is reported as a 429, with how long to wait.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from './env.mjs';
import { authRequest } from './hasura.mjs';

const CACHE_PATH = resolve(ROOT, '.auth-cache.json');
const SAFETY_WINDOW_SECONDS = 120;

function readCache() {
  if (!existsSync(CACHE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CACHE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function writeCache(cache) {
  writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, { mode: 0o600 });
}

/** Seconds until this access token expires (negative when already expired). */
function secondsUntilExpiry(accessToken) {
  try {
    const [, payload] = accessToken.split('.');
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof decoded.exp !== 'number') return -1;
    return decoded.exp - Math.floor(Date.now() / 1000);
  } catch {
    return -1;
  }
}

function sessionFrom(json) {
  const session = json?.session;
  if (!session?.accessToken || !session.user?.id) return null;
  return {
    token: session.accessToken,
    refreshToken: session.refreshToken,
    userId: session.user.id,
    email: session.user.email,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Returns a usable session for `email`, from cache, refresh, or a fresh sign-in.
 * Retries a rate-limited sign-in a couple of times before giving up.
 */
export async function getSession(email, password) {
  const cache = readCache();
  const cached = cache[email];

  if (cached?.token && secondsUntilExpiry(cached.token) > SAFETY_WINDOW_SECONDS) {
    return { token: cached.token, userId: cached.userId, email };
  }

  if (cached?.refreshToken) {
    const refreshed = await authRequest('/token', { refreshToken: cached.refreshToken });
    const session = sessionFrom(refreshed.json);
    if (session) {
      cache[email] = session;
      writeCache(cache);
      return { token: session.token, userId: session.userId, email };
    }
  }

  let lastStatus = 0;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const res = await authRequest('/signin/email-password', { email, password });
    lastStatus = res.status;
    const session = sessionFrom(res.json);
    if (session) {
      cache[email] = session;
      writeCache(cache);
      return { token: session.token, userId: session.userId, email };
    }
    if (res.status !== 429) break;
    if (attempt < 3) {
      console.log(
        `  ! Nhost Auth rate-limited the sign-in for ${email}; waiting 20s (attempt ${attempt}/3)`,
      );
      await sleep(20_000);
    }
  }

  if (lastStatus === 429) {
    throw new Error(
      `Nhost Auth is rate-limiting sign-ins (HTTP 429) for ${email}.\n` +
        'Wait a few minutes and re-run. Sessions are cached in .auth-cache.json, so a\n' +
        'successful run makes subsequent runs cheap.',
    );
  }
  throw new Error(
    `Could not sign in as ${email} (HTTP ${lastStatus}). Run "npm run seed" first to create the demo accounts.`,
  );
}

export function clearSessionCache() {
  writeCache({});
}
