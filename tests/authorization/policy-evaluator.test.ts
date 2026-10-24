import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  createPolicyRevision,
  evaluatePolicy,
  type AuthorizationPolicy,
} from '../../src/lib/authorization/policy-evaluator';

type SharedFixture = {
  name: string;
  now: string;
  snapshot_valid_until: string;
  request: {
    tenant_id: string;
    principal_id: string;
    action: string;
    resource: string;
  };
  policies: Array<{
    policy_id: string;
    tenant_id: string;
    principal_id: string;
    action: string;
    resource: string;
    effect: 'ALLOW' | 'DENY';
    valid_from: string;
    valid_until: string | null;
  }>;
  expected: {
    decision: 'ALLOW' | 'DENY';
    reason: string;
    policy_id: string;
  };
};

const fixtures = JSON.parse(
  readFileSync(new URL('../fixtures/authorization-policy-cases.json', import.meta.url), 'utf8'),
) as SharedFixture[];

function mapPolicy(policy: SharedFixture['policies'][number]): AuthorizationPolicy {
  return {
    policyId: policy.policy_id,
    tenantId: policy.tenant_id,
    principalId: policy.principal_id,
    action: policy.action,
    resource: policy.resource,
    effect: policy.effect,
    validFrom: new Date(policy.valid_from),
    validUntil: policy.valid_until ? new Date(policy.valid_until) : null,
  };
}

describe('authorization evaluator shared Go/TypeScript fixtures', () => {
  for (const fixture of fixtures) {
    it(fixture.name, () => {
      const outcome = evaluatePolicy(
        fixture.policies.map(mapPolicy),
        {
          tenantId: fixture.request.tenant_id,
          principalId: fixture.request.principal_id,
          action: fixture.request.action,
          resource: fixture.request.resource,
        },
        new Date(fixture.now),
      );

      assert.equal(outcome.decision, fixture.expected.decision);
      assert.equal(outcome.reason, fixture.expected.reason);
      assert.equal(outcome.policyId ?? '', fixture.expected.policy_id);
    });
  }
});

describe('authorization policy revision', () => {
  it('is deterministic regardless of source row order and changes when a policy changes', () => {
    const policies = fixtures[0].policies.map(mapPolicy);
    const second = mapPolicy({
      ...fixtures[1].policies[0],
      policy_id: 'policy-z',
    });
    const revision = createPolicyRevision([...policies, second]);

    assert.match(revision, /^sha256:[a-f0-9]{64}$/);
    assert.equal(createPolicyRevision([second, ...policies]), revision);
    assert.notEqual(
      createPolicyRevision([
        ...policies,
        { ...second, effect: 'ALLOW' },
      ]),
      revision,
    );
  });
});
