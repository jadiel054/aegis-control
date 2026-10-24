import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(request: Request, expectedSecret: string): boolean {
  const header = request.headers.get('x-aegis-gateway-secret') ?? '';
  const provided = Buffer.from(header, 'utf8');
  const expected = Buffer.from(expectedSecret, 'utf8');
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function asISO(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error('Invalid timestamp in policy source');
  return date.toISOString();
}

export async function GET(request: Request) {
  const secret = process.env.AEGIS_GATEWAY_SYNC_SECRET;
  if (!secret || secret.length < 32) {
    return NextResponse.json({ error: 'Policy snapshot service is not configured' }, { status: 503 });
  }
  if (!authorized(request, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ttlSeconds = Number(process.env.AEGIS_POLICY_SNAPSHOT_TTL_SECONDS ?? '30');
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 3600) {
    return NextResponse.json({ error: 'Invalid policy snapshot TTL configuration' }, { status: 503 });
  }

  try {
    const sql = getSql();
    const rows = await sql`
      SELECT id::text AS policy_id, tenant_id, principal_id, action, resource,
             effect, valid_from, valid_until
      FROM public.authorization_policies
      WHERE enabled = TRUE
      ORDER BY id ASC
    `;
    const policies = rows.map((row: Record<string, unknown>) => ({
      policy_id: String(row.policy_id),
      tenant_id: String(row.tenant_id),
      principal_id: String(row.principal_id),
      action: String(row.action),
      resource: String(row.resource),
      effect: String(row.effect),
      valid_from: asISO(row.valid_from),
      valid_until: row.valid_until == null ? null : asISO(row.valid_until),
    }));
    const generatedAt = new Date();
    const validUntil = new Date(generatedAt.getTime() + ttlSeconds * 1000);
    const revision = `sha256:${createHash('sha256').update(JSON.stringify(policies)).digest('hex')}`;

    return NextResponse.json({
      schema_version: 1,
      revision,
      generated_at: generatedAt.toISOString(),
      valid_until: validUntil.toISOString(),
      policies,
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    console.error('[policy-snapshot] Failed to build policy snapshot', error);
    return NextResponse.json({ error: 'Policy snapshot unavailable' }, { status: 503 });
  }
}
