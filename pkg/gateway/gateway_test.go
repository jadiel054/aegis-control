package gateway

import (
	"context"
	"errors"
	"testing"
	"time"

	"aegis-control/pkg/cache"
)

func newTestHandler(t *testing.T, workers, queueSize int, policyCache *cache.PolicyCache) *AgentGatewayHandler {
	t.Helper()
	handler, err := NewAgentGatewayHandler(workers, queueSize, policyCache)
	if err != nil {
		t.Fatalf("NewAgentGatewayHandler() error = %v", err)
	}
	return handler
}

func TestGatewayPolicyDecisions(t *testing.T) {
	policyCache := &cache.PolicyCache{}
	policyCache.UpdatePolicies(map[string]*cache.Policy{
		"allow-policy": {ID: "allow-policy", Allow: true},
		"deny-policy":  {ID: "deny-policy", Allow: false},
	})

	handler := newTestHandler(t, 2, 4, policyCache)
	defer handler.Stop()

	allow, err := handler.EvaluateAccess(context.Background(), "allow-policy", time.Second)
	if err != nil || !allow {
		t.Fatalf("expected access allowed, got allow=%v, err=%v", allow, err)
	}

	allow, err = handler.EvaluateAccess(context.Background(), "deny-policy", time.Second)
	if allow || !errors.Is(err, ErrAccessDenied) {
		t.Fatalf("expected access denied, got allow=%v, err=%v", allow, err)
	}

	allow, err = handler.EvaluateAccess(context.Background(), "missing-policy", time.Second)
	if allow || !errors.Is(err, ErrPolicyNotFound) {
		t.Fatalf("expected missing policy error while connected, got allow=%v, err=%v", allow, err)
	}

	handler.SetConnectionState(false)
	allow, err = handler.EvaluateAccess(context.Background(), "allow-policy", time.Second)
	if err != nil || !allow {
		t.Fatalf("expected valid local policy to allow during partition, got allow=%v, err=%v", allow, err)
	}
	allow, err = handler.EvaluateAccess(context.Background(), "missing-policy", time.Second)
	if allow || !errors.Is(err, ErrAccessDenied) {
		t.Fatalf("expected missing policy to fail closed during partition, got allow=%v, err=%v", allow, err)
	}
}

func TestGatewayQueueFullRejection(t *testing.T) {
	policyCache := &cache.PolicyCache{}
	policyCache.UpdatePolicies(map[string]*cache.Policy{
		"allow-policy": {ID: "allow-policy", Allow: true},
	})

	handler := newTestHandler(t, 1, 1, policyCache)
	defer handler.Stop()

	block := make(chan struct{})
	started := make(chan struct{})
	if err := handler.pool.Submit(func() {
		close(started)
		<-block
	}); err != nil {
		t.Fatalf("could not submit blocking task: %v", err)
	}
	<-started
	defer close(block)
	if err := handler.pool.Submit(func() {}); err != nil {
		t.Fatalf("could not fill worker queue: %v", err)
	}

	allow, err := handler.EvaluateAccess(context.Background(), "allow-policy", time.Second)
	if allow || !errors.Is(err, ErrQueueFull) {
		t.Fatalf("expected queue-full rejection, got allow=%v, err=%v", allow, err)
	}
}

func TestGatewayTimeoutExpiration(t *testing.T) {
	policyCache := &cache.PolicyCache{}
	policyCache.UpdatePolicies(map[string]*cache.Policy{
		"allow-policy": {ID: "allow-policy", Allow: true},
	})

	handler := newTestHandler(t, 1, 1, policyCache)
	defer handler.Stop()

	block := make(chan struct{})
	started := make(chan struct{})
	if err := handler.pool.Submit(func() {
		close(started)
		<-block
	}); err != nil {
		t.Fatalf("could not submit blocking task: %v", err)
	}
	<-started
	defer close(block)

	start := time.Now()
	allow, err := handler.EvaluateAccess(context.Background(), "allow-policy", 100*time.Millisecond)
	elapsed := time.Since(start)
	if allow || !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected deadline to deny access, got allow=%v, err=%v", allow, err)
	}
	if elapsed > time.Second {
		t.Fatalf("EvaluateAccess did not respect timeout: took %v", elapsed)
	}
}

func TestGatewayCanceledContextTakesPrecedence(t *testing.T) {
	policyCache := &cache.PolicyCache{}
	policyCache.UpdatePolicies(map[string]*cache.Policy{
		"allow-policy": {ID: "allow-policy", Allow: true},
	})
	handler := newTestHandler(t, 1, 1, policyCache)
	defer handler.Stop()

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	allow, err := handler.EvaluateAccess(ctx, "allow-policy", time.Second)
	if allow || !errors.Is(err, context.Canceled) {
		t.Fatalf("expected canceled context to deny access, got allow=%v, err=%v", allow, err)
	}

	allow, err = handler.EvaluateAccess(nil, "allow-policy", time.Second)
	if allow || !errors.Is(err, ErrNilContext) {
		t.Fatalf("expected nil context to return ErrNilContext, got allow=%v, err=%v", allow, err)
	}
}

func TestNewAgentGatewayHandlerRejectsInvalidConfiguration(t *testing.T) {
	policyCache := &cache.PolicyCache{}
	for _, test := range []struct {
		name      string
		workers   int
		queueSize int
	}{
		{name: "zero workers", workers: 0, queueSize: 1},
		{name: "negative workers", workers: -1, queueSize: 1},
		{name: "negative queue", workers: 1, queueSize: -1},
	} {
		t.Run(test.name, func(t *testing.T) {
			handler, err := NewAgentGatewayHandler(test.workers, test.queueSize, policyCache)
			if handler != nil || !errors.Is(err, ErrInvalidPoolConfig) {
				t.Fatalf("expected ErrInvalidPoolConfig, got handler=%v, err=%v", handler, err)
			}
		})
	}

	handler, err := NewAgentGatewayHandler(1, 1, nil)
	if handler != nil || !errors.Is(err, ErrNilPolicyCache) {
		t.Fatalf("expected ErrNilPolicyCache, got handler=%v, err=%v", handler, err)
	}
}
