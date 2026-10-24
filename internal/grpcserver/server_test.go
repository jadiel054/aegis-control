package grpcserver

import (
	"context"
	"net"
	"strings"
	"testing"
	"time"

	authorizationv1 "aegis-control/gen/go/aegis/authorization/v1"
	"aegis-control/pkg/cache"
	"aegis-control/pkg/gateway"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/grpc/test/bufconn"
)

const testToken = "test-token-with-more-than-thirty-two-characters"

func newContractClient(t *testing.T, policyCache *cache.PolicyCache) authorizationv1.AuthorizationServiceClient {
	t.Helper()
	listener := bufconn.Listen(1 << 20)
	evaluator, err := gateway.NewAgentGatewayHandler(2, 8, policyCache)
	if err != nil {
		t.Fatal(err)
	}
	server := NewServer(evaluator, testToken)
	go func() { _ = server.Serve(listener) }()
	t.Cleanup(func() { server.Stop(); evaluator.Stop(); _ = listener.Close() })
	conn, err := grpc.NewClient("passthrough:///bufconn",
		grpc.WithContextDialer(func(context.Context, string) (net.Conn, error) { return listener.Dial() }),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	return authorizationv1.NewAuthorizationServiceClient(conn)
}

func authorizedContext() context.Context {
	return metadata.NewOutgoingContext(context.Background(), metadata.Pairs("authorization", "Bearer "+testToken))
}

func TestEvaluateAccessContractAllowsExactMatchingRule(t *testing.T) {
	now := time.Now().UTC()
	policyCache := &cache.PolicyCache{}
	if err := policyCache.ReplaceSnapshot(cache.Snapshot{
		SchemaVersion: 1, Revision: "sha256:test", GeneratedAt: now.Add(-time.Second), ValidUntil: now.Add(time.Minute),
		Policies: []cache.Policy{{ID: "p-1", TenantID: "tenant-a", PrincipalID: "agent-a", Action: "read", Resource: "report/1", Effect: "ALLOW", ValidFrom: now.Add(-time.Hour)}},
	}); err != nil {
		t.Fatal(err)
	}
	client := newContractClient(t, policyCache)
	response, err := client.EvaluateAccess(authorizedContext(), &authorizationv1.EvaluateAccessRequest{
		RequestId: "req-1", TenantId: "tenant-a", PrincipalId: "agent-a", Action: "read", Resource: "report/1",
	})
	if err != nil {
		t.Fatal(err)
	}
	if response.GetDecision() != authorizationv1.Decision_DECISION_ALLOW || response.GetPolicyId() != "p-1" || response.GetPolicyRevision() != "sha256:test" || response.GetRequestId() != "req-1" {
		t.Fatalf("unexpected contract response: %+v", response)
	}
}

func TestEvaluateAccessContractReturnsExplicitDeny(t *testing.T) {
	now := time.Now().UTC()
	policyCache := &cache.PolicyCache{}
	if err := policyCache.ReplaceSnapshot(cache.Snapshot{
		SchemaVersion: 1, Revision: "r-deny", GeneratedAt: now.Add(-time.Second), ValidUntil: now.Add(time.Minute),
		Policies: []cache.Policy{{ID: "p-deny", TenantID: "t", PrincipalID: "a", Action: "delete", Resource: "reports/1", Effect: "DENY", ValidFrom: now.Add(-time.Hour)}},
	}); err != nil {
		t.Fatal(err)
	}
	response, err := newContractClient(t, policyCache).EvaluateAccess(authorizedContext(), &authorizationv1.EvaluateAccessRequest{
		TenantId: "t", PrincipalId: "a", Action: "delete", Resource: "reports/1",
	})
	if err != nil {
		t.Fatal(err)
	}
	if response.GetDecision() != authorizationv1.Decision_DECISION_DENY || response.GetReason() != "POLICY_DENIED" || response.GetPolicyId() != "p-deny" {
		t.Fatalf("unexpected explicit deny response: %+v", response)
	}
}

func TestEvaluateAccessContractDeniesMissingOrExpiredSnapshot(t *testing.T) {
	missing := newContractClient(t, &cache.PolicyCache{})
	response, err := missing.EvaluateAccess(authorizedContext(), &authorizationv1.EvaluateAccessRequest{
		RequestId: "req-deny", TenantId: "tenant-a", PrincipalId: "agent-a", Action: "delete", Resource: "report/1",
	})
	if err != nil {
		t.Fatal(err)
	}
	if response.GetDecision() != authorizationv1.Decision_DECISION_DENY || response.GetReason() != "POLICY_SNAPSHOT_UNAVAILABLE" {
		t.Fatalf("missing snapshot must fail closed, got %+v", response)
	}

	now := time.Now().UTC()
	expiredCache := &cache.PolicyCache{}
	if err := expiredCache.ReplaceSnapshot(cache.Snapshot{SchemaVersion: 1, Revision: "r-old", GeneratedAt: now.Add(-time.Minute), ValidUntil: now.Add(-time.Second)}); err != nil {
		t.Fatal(err)
	}
	expired, err := newContractClient(t, expiredCache).EvaluateAccess(authorizedContext(), &authorizationv1.EvaluateAccessRequest{
		TenantId: "tenant-a", PrincipalId: "agent-a", Action: "read", Resource: "report/1",
	})
	if err != nil {
		t.Fatal(err)
	}
	if expired.GetDecision() != authorizationv1.Decision_DECISION_DENY || expired.GetReason() != "POLICY_SNAPSHOT_EXPIRED" {
		t.Fatalf("expired snapshot must fail closed, got %+v", expired)
	}
}

func TestEvaluateAccessRequiresServiceTokenAndCompleteContract(t *testing.T) {
	client := newContractClient(t, &cache.PolicyCache{})
	_, err := client.EvaluateAccess(context.Background(), &authorizationv1.EvaluateAccessRequest{TenantId: "t"})
	if status.Code(err) != codes.Unauthenticated {
		t.Fatalf("expected unauthenticated, got %v", err)
	}
	_, err = client.EvaluateAccess(authorizedContext(), &authorizationv1.EvaluateAccessRequest{TenantId: "t"})
	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("expected invalid argument, got %v", err)
	}
	_, err = client.EvaluateAccess(authorizedContext(), &authorizationv1.EvaluateAccessRequest{
		TenantId: strings.Repeat("x", 513), PrincipalId: "a", Action: "read", Resource: "report/1",
	})
	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("expected oversized field to be rejected, got %v", err)
	}
	_, err = client.EvaluateAccess(authorizedContext(), &authorizationv1.EvaluateAccessRequest{
		TenantId: strings.Repeat("é", 257), PrincipalId: "a", Action: "read", Resource: "report/1",
	})
	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("expected oversized UTF-8 field to be rejected, got %v", err)
	}
	_, err = client.EvaluateAccess(authorizedContext(), &authorizationv1.EvaluateAccessRequest{
		RequestId: strings.Repeat("r", 129), TenantId: "t", PrincipalId: "a", Action: "read", Resource: "report/1",
	})
	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("expected oversized request_id to be rejected, got %v", err)
	}
}
