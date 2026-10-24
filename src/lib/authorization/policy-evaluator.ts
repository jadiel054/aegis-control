import { createHash } from 'node:crypto';

export type AuthorizationPolicy = {
  policyId: string;
  tenantId: string;
  principalId: string;
  action: string;
  resource: string;
  effect: 'ALLOW' | 'DENY';
  validFrom: Date;
  validUntil: Date | null;
};

export type AuthorizationRequest = {
  tenantId: string;
  principalId: string;
  action: string;
  resource: string;
};

export type PolicyOutcome = {
  decision: 'ALLOW' | 'DENY';
  reason: string;
  policyId?: string;
};

function canonicalPolicy(policy: AuthorizationPolicy) {
  return {
    policy_id: policy.policyId,
    tenant_id: policy.tenantId,
    principal_id: policy.principalId,
    action: policy.action,
    resource: policy.resource,
    effect: policy.effect,
    valid_from: policy.validFrom.toISOString(),
    valid_until: policy.validUntil?.toISOString() ?? null,
  };
}

/** Hashes canonical policies in stable ID order, independent of source row order. */
export function createPolicyRevision(policies: readonly AuthorizationPolicy[]): string {
  const canonical = [...policies]
    .sort((left, right) => (left.policyId < right.policyId ? -1 : left.policyId > right.policyId ? 1 : 0))
    .map(canonicalPolicy);

  return `sha256:${createHash('sha256').update(JSON.stringify(canonical)).digest('hex')}`;
}

/** Evaluates an exact tenant/principal/action/resource match; any non-ALLOW outcome denies. */
export function evaluatePolicy(
  policies: readonly AuthorizationPolicy[],
  request: AuthorizationRequest,
  now: Date,
): PolicyOutcome {
  const policy = policies.find((candidate) =>
    candidate.tenantId === request.tenantId &&
    candidate.principalId === request.principalId &&
    candidate.action === request.action &&
    candidate.resource === request.resource,
  );

  if (!policy) return { decision: 'DENY', reason: 'POLICY_NOT_FOUND' };
  if (now < policy.validFrom) {
    return { decision: 'DENY', reason: 'POLICY_NOT_ACTIVE', policyId: policy.policyId };
  }
  if (policy.validUntil && now >= policy.validUntil) {
    return { decision: 'DENY', reason: 'POLICY_EXPIRED', policyId: policy.policyId };
  }
  if (policy.effect !== 'ALLOW') {
    return { decision: 'DENY', reason: 'POLICY_DENIED', policyId: policy.policyId };
  }

  return { decision: 'ALLOW', reason: 'ALLOW', policyId: policy.policyId };
}
