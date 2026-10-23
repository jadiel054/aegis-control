/**
 * Browser-side helper — all data goes through Next.js API routes (Neon behind them).
 */

export async function apiGet<T = unknown>(path: string): Promise<T> {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `GET ${path} failed`);
  }
  return res.json();
}

export async function apiPost<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `POST ${path} failed`);
  }
  return res.json();
}

export async function apiPatch<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `PATCH ${path} failed`);
  }
  return res.json();
}
