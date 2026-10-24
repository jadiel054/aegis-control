import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const proto = readFileSync(
  new URL('../../api/proto/aegis/authorization/v1/authorization.proto', import.meta.url),
  'utf8',
);

describe('AuthorizationService protobuf contract', () => {
  it('keeps the RPC request identity tuple and response decision metadata', () => {
    assert.match(proto, /rpc EvaluateAccess\(EvaluateAccessRequest\) returns \(EvaluateAccessResponse\)/);
    for (const field of ['request_id', 'tenant_id', 'principal_id', 'action', 'resource']) {
      assert.match(proto, new RegExp(`string\\s+${field}\\s*=`));
    }
    for (const field of ['decision', 'reason', 'policy_id', 'policy_revision', 'evaluated_at']) {
      assert.match(proto, new RegExp(`(?:Decision|string)\\s+${field}\\s*=`));
    }
    assert.match(proto, /DECISION_ALLOW\s*=\s*1/);
    assert.match(proto, /DECISION_DENY\s*=\s*2/);
    assert.match(proto, /option go_package = "aegis-control\/gen\/go\/aegis\/authorization\/v1;/);
  });
});
