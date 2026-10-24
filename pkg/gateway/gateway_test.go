package gateway

import (
	"context"
	"testing"
	"time"

	"aegis-control/pkg/cache"
)

func TestGatewayTimeoutAndFailClosed(t *testing.T) {
	policyCache := &cache.PolicyCache{}
	policyCache.UpdatePolicies(map[string]*cache.Policy{
		"allow-policy": {ID: "allow-policy", Allow: true},
		"deny-policy":  {ID: "deny-policy", Allow: false},
	})

	handler := NewAgentGatewayHandler(5, 10, policyCache)
	defer handler.Stop()

	ctx := context.Background()

	// 1. Test normal execution with allowed policy
	allow, err := handler.EvaluateAccess(ctx, "allow-policy", 1*time.Second)
	if err != nil || !allow {
		t.Fatalf("expected access allowed, got allow=%v, err=%v", allow, err)
	}

	// 2. Test normal execution with denied policy
	allow, err = handler.EvaluateAccess(ctx, "deny-policy", 1*time.Second)
	if allow || err == nil {
		t.Fatalf("expected access denied, got allow=%v, err=%v", allow, err)
	}

	// 3. Test Fail-Closed on Network Partition (connection down)
	handler.SetConnectionState(false)

	// Existing allowed policy in local cache should still allow if valid
	allow, err = handler.EvaluateAccess(ctx, "allow-policy", 1*time.Second)
	if err != nil || !allow {
		t.Fatalf("expected local cached allowed policy to pass during network partition, got allow=%v, err=%v", allow, err)
	}

	// Missing policy during network partition MUST fail closed
	allow, err = handler.EvaluateAccess(ctx, "non-existent-policy", 1*time.Second)
	if allow || err == nil {
		t.Fatalf("expected fail-closed for non-existent policy during network partition, got allow=%v, err=%v", allow, err)
	}

	// Denied policy during network partition MUST fail closed
	allow, err = handler.EvaluateAccess(ctx, "deny-policy", 1*time.Second)
	if allow || err == nil {
		t.Fatalf("expected fail-closed for denied policy during network partition, got allow=%v, err=%v", allow, err)
	}
}
