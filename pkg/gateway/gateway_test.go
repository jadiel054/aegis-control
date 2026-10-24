package gateway

import (
	"context"
	"errors"
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

// TestGatewayQueueFullRejection verifica que solicitações são rejeitadas quando
// o worker está ocupado e a fila configurada também está cheia.
func TestGatewayQueueFullRejection(t *testing.T) {
	policyCache := &cache.PolicyCache{}
	policyCache.UpdatePolicies(map[string]*cache.Policy{
		"allow-policy": {ID: "allow-policy", Allow: true},
	})

	// Um worker fica bloqueado e a fila de um item é preenchida explicitamente.
	handler := NewAgentGatewayHandler(1, 1, policyCache)
	defer handler.Stop()

	block := make(chan struct{})
	started := make(chan struct{})
	if !handler.pool.Submit(func() {
		close(started)
		<-block
	}) {
		t.Fatal("could not submit blocking task")
	}
	<-started
	defer close(block)
	if !handler.pool.Submit(func() {}) {
		t.Fatal("could not fill worker queue")
	}

	allow, err := handler.EvaluateAccess(context.Background(), "allow-policy", 1*time.Second)
	if allow {
		t.Fatalf("expected queue-full rejection to deny access, got allow=%v", allow)
	}
	if !errors.Is(err, ErrQueueFull) {
		t.Fatalf("expected ErrQueueFull on queue-full rejection, got %v", err)
	}
}

// TestGatewayTimeoutExpiration cobre a expiração real do timeout: com o
// worker bloqueado, o chamador deve receber fail-closed via ctx.Deadline
// dentro do prazo, sem travar.
func TestGatewayTimeoutExpiration(t *testing.T) {
	policyCache := &cache.PolicyCache{}
	policyCache.UpdatePolicies(map[string]*cache.Policy{
		"allow-policy": {ID: "allow-policy", Allow: true},
	})

	handler := NewAgentGatewayHandler(1, 1, policyCache)
	defer handler.Stop()

	block := make(chan struct{})
	started := make(chan struct{})
	if !handler.pool.Submit(func() {
		close(started)
		<-block
	}) {
		t.Fatal("could not submit blocking task")
	}
	<-started
	defer close(block)

	start := time.Now()
	allow, err := handler.EvaluateAccess(context.Background(), "allow-policy", 100*time.Millisecond)
	elapsed := time.Since(start)

	if allow {
		t.Fatalf("expected timeout to deny access, got allow=%v", allow)
	}
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected deadline-exceeded error on timeout, got %v", err)
	}
	if elapsed > 1*time.Second {
		t.Fatalf("EvaluateAccess did not respect timeout: took %v", elapsed)
	}
}
