import { cookies } from 'next/headers';

const COOKIE_NAME = 'aegis_session';
const SESSION_VALUE = 'authorized';

export function isAuthorized(): boolean {
  const password = process.env.AEGIS_ADMIN_PASSWORD;
  // If no password configured, allow access (dev mode)
  if (!password) return true;
  const jar = cookies();
  return jar.get(COOKIE_NAME)?.value === SESSION_VALUE;
}

export function setAuthCookie() {
  const jar = cookies();
  jar.set(COOKIE_NAME, SESSION_VALUE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

export function clearAuthCookie() {
  const jar = cookies();
  jar.delete(COOKIE_NAME);
}

export function verifyPassword(input: string): boolean {
  const expected = process.env.AEGIS_ADMIN_PASSWORD;
  if (!expected) return true; // open if not set
  return input === expected;
}
