import { cookies } from 'next/headers';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const COOKIE_NAME = 'aegis_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSessionSecret(): string {
  // Prefer a dedicated secret; fall back to admin password so existing envs keep working.
  return (
    process.env.AEGIS_SESSION_SECRET ||
    process.env.AEGIS_ADMIN_PASSWORD ||
    ''
  );
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
}

/** Constant-time password check. Returns false if password is not configured in production. */
export function verifyPassword(input: string): boolean {
  const expected = process.env.AEGIS_ADMIN_PASSWORD;

  if (!expected) {
    // Fail closed in production; allow open only in local/dev for convenience.
    if (isProduction()) return false;
    return true;
  }

  const a = Buffer.from(input);
  const b = Buffer.from(expected);

  if (a.length !== b.length) {
    // Still run a dummy comparison to reduce timing leakage on length.
    timingSafeEqual(a, a);
    return false;
  }

  return timingSafeEqual(a, b);
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function createSessionToken(secret: string): string {
  const nonce = randomBytes(16).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `${nonce}.${exp}`;
  const sig = sign(payload, secret);
  return `${payload}.${sig}`;
}

function verifySessionToken(token: string, secret: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const [nonce, expStr, sig] = parts;
  if (!nonce || !expStr || !sig) return false;

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
    return false;
  }

  const payload = `${nonce}.${expStr}`;
  const expectedSig = sign(payload, secret);

  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function isAuthorized(): boolean {
  const secret = getSessionSecret();

  // No secret configured → fail closed in production
  if (!secret) {
    if (isProduction()) return false;
    // Local/dev convenience only
    return true;
  }

  const jar = cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return false;

  return verifySessionToken(token, secret);
}

export function setAuthCookie() {
  const secret = getSessionSecret();
  if (!secret) {
    throw new Error('Cannot set session: AEGIS_ADMIN_PASSWORD (or AEGIS_SESSION_SECRET) is not configured');
  }

  const token = createSessionToken(secret);
  const jar = cookies();

  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearAuthCookie() {
  const jar = cookies();
  jar.delete(COOKIE_NAME);
}
