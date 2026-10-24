import { timingSafeEqual } from 'node:crypto';
import { Code, ConnectError } from '@connectrpc/connect';
import { getSql } from '@/lib/db';
import { createPolicyRevision, evaluatePolicy, type AuthorizationPolicy } from './policy-evaluator';
import {
  Decision,
  EvaluateAccessRequest,
  EvaluateAccessResponse,
} from '@/gen/aegis/authorization/v1/authorization_pb';

type PolicyRow = {
  policy_id: string;
  tenant_id: string;
  principal_id: string;
  action: string;
  resource: string;
  effect: 'ALLOW' | 'DENY';
  valid_from: string | Date;
  valid_until: string | Date | null;
};

type Policy = AuthorizationPolicy;

type PolicySnapshot = {
  policies: Policy[];
  revision: string;
  expiresAt: number;
};

const CACHE_TTL_MS = 5_000;
let memorySnapshot: PolicySnapshot | undefined;

function invalid(message: string): never {
  throw new ConnectError(message, Code.InvalidArgument);
}

function validateText(value: string, field: string, maxBytes: number): string {
  const normalized = value.trim();
  if (!normalized) invalid(`${field} is required`);
  if (Buffer.byteLength(normalized, 'utf8') > maxBytes) {
    invalid(`${field} must not exceed ${maxBytes} bytes`);
  }
  return normalized;
}

function asDate(value: string | Date, field: string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ConnectError(`invalid ${field} in policy source`, Code.Internal);
  }
  return date;
}

function authenticate(request: RequestLike): void {
  const expected = process.env.AEGIS_AUTHORIZATION_DIAGNOSTIC_KEY?.trim();
  if (!expected || expected.length < 32) {
    throw new ConnectError('authorization service is not configured', Code.Unavailable);
  }
  const header = request.requestHeader.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const provided = Buffer.from(token, 'utf8');
  const secret = Buffer.from(expected, 'utf8');
  if (provided.length !== secret.length || !timingSafeEqual(provided, secret)) {
    throw new ConnectError('unauthenticated', Code.Unauthenticated);
  }
}

interface RequestLike {
  requestHeader: Headers;
}

async function loadSnapshot(): Promise<PolicySnapshot> {
  const now = Date.now();
  if (memorySnapshot && memorySnapshot.expiresAt > now) return memorySnapshot;

  try {
    const sql = getSql();
    const rows = await sql`
      SELECT id::text AS policy_id, tenant_id, principal_id, action, resource,
             effect, valid_from, valid_until
      FROM public.authorization_policies
      WHERE enabled = TRUE
      ORDER BY id ASC
    ` as PolicyRow[];

    const policies = rows.map((row) => {
      const validFrom = asDate(row.valid_from, 'valid_from');
      const validUntil = row.valid_until == null ? null : asDate(row.valid_until, 'valid_until');
      if (validUntil && validUntil <= validFrom) {
        throw new ConnectError('invalid policy validity window', Code.Internal);
      }
      return {
        policyId: String(row.policy_id),
        tenantId: String(row.tenant_id),
        principalId: String(row.principal_id),
        action: String(row.action),
        resource: String(row.resource),
        effect: row.effect,
        validFrom,
        validUntil,
      } satisfies Policy;
    });

    const revision = createPolicyRevision(policies);
    memorySnapshot = { policies, revision, expiresAt: now + CACHE_TTL_MS };
    return memorySnapshot;
  } catch (error) {
    memorySnapshot = undefined;
    if (error instanceof ConnectError) throw error;
    console.error('[authorization] policy source unavailable', error);
    throw new ConnectError('authorization backend unavailable', Code.Unavailable);
  }
}

export async function evaluateAccess(
  request: EvaluateAccessRequest,
  context: RequestLike,
): Promise<EvaluateAccessResponse> {
  authenticate(context);

  const requestId = request.requestId.trim();
  if (Buffer.byteLength(requestId, 'utf8') > 128) {
    invalid('request_id must not exceed 128 bytes');
  }
  const tenantId = validateText(request.tenantId, 'tenant_id', 512);
  const principalId = validateText(request.principalId, 'principal_id', 512);
  const action = validateText(request.action, 'action', 512);
  const resource = validateText(request.resource, 'resource', 512);
  const snapshot = await loadSnapshot();
  const now = new Date();
  const base = {
    requestId,
    policyRevision: snapshot.revision,
    evaluatedAt: now.toISOString(),
  };
  const outcome = evaluatePolicy(snapshot.policies, { tenantId, principalId, action, resource }, now);
  return new EvaluateAccessResponse({
    ...base,
    decision: outcome.decision === 'ALLOW' ? Decision.ALLOW : Decision.DENY,
    reason: outcome.reason,
    ...(outcome.policyId ? { policyId: outcome.policyId } : {}),
  });
}
