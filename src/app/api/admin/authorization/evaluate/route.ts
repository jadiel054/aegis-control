import { randomUUID, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { evaluateAccess } from '@/lib/grpc-authorization-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(request: Request, expected: string): boolean {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const provided = Buffer.from(token, 'utf8');
  const secret = Buffer.from(expected, 'utf8');
  return provided.length === secret.length && timingSafeEqual(provided, secret);
}

function isInputString(value: unknown, maxBytes = 512): value is string {
  return typeof value === 'string'
    && value.trim().length > 0
    && Buffer.byteLength(value.trim(), 'utf8') <= maxBytes;
}

export async function POST(request: Request) {
  const diagnosticKey = process.env.AEGIS_AUTHORIZATION_DIAGNOSTIC_KEY;
  if (!diagnosticKey || diagnosticKey.length < 32) {
    return NextResponse.json({ error: 'Authorization diagnostic endpoint is not configured' }, { status: 503 });
  }
  if (!authorized(request, diagnosticKey)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return NextResponse.json({ error: 'JSON body must be an object' }, { status: 400 });
  }
  const body = parsed as Record<string, unknown>;
  const fields = ['tenant_id', 'principal_id', 'action', 'resource'] as const;
  if (!fields.every((field) => isInputString(body[field]))) {
    return NextResponse.json({ error: 'tenant_id, principal_id, action and resource are required strings' }, { status: 400 });
  }
  if (body.request_id !== undefined && body.request_id !== '' && !isInputString(body.request_id, 128)) {
    return NextResponse.json({ error: 'request_id must be a non-empty string of at most 128 UTF-8 bytes' }, { status: 400 });
  }

  try {
    const result = await evaluateAccess({
      requestId: isInputString(body.request_id, 128) ? body.request_id.trim() : randomUUID(),
      tenantId: (body.tenant_id as string).trim(),
      principalId: (body.principal_id as string).trim(),
      action: (body.action as string).trim(),
      resource: (body.resource as string).trim(),
    });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = (error as { code?: number }).code;
    const status = code === 4 ? 504 : code === 14 ? 503 : 502;
    console.error('[authorization-evaluate] Gateway RPC failed', error);
    return NextResponse.json({ error: 'Authorization gateway unavailable' }, { status });
  }
}
