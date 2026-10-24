package cache

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func TestConcurrentPolicyCache(t *testing.T) {
	c := &PolicyCache{}
	c.UpdatePolicies(map[string]*Policy{"p1": {ID: "p1", Effect: "ALLOW"}})
	var wg sync.WaitGroup
	for reader := 0; reader < 100; reader++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < 100; i++ {
				_, _ = c.GetPolicy("p1")
			}
		}()
	}
	for writer := 0; writer < 20; writer++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			for i := 0; i < 20; i++ {
				c.UpdatePolicies(map[string]*Policy{fmt.Sprintf("p-%d-%d", id, i): {ID: "p"}})
			}
		}(writer)
	}
	wg.Wait()
}

func TestGetPolicyReturnsDefensiveCopy(t *testing.T) {
	c := &PolicyCache{}
	c.UpdatePolicies(map[string]*Policy{"p1": {ID: "p1", Effect: "ALLOW"}})
	got, ok := c.GetPolicy("p1")
	if !ok {
		t.Fatal("expected policy p1")
	}
	got.ID = "mutated"
	again, ok := c.GetPolicy("p1")
	if !ok || again.ID != "p1" {
		t.Fatalf("mutating result changed cache: %+v", again)
	}
}

func TestReplaceSnapshotEvaluatesExactMatchAndFailsClosed(t *testing.T) {
	now := time.Date(2026, 10, 24, 12, 0, 0, 0, time.UTC)
	validUntil := now.Add(time.Minute)
	c := &PolicyCache{}
	snapshot := Snapshot{
		SchemaVersion: 1,
		Revision:      "sha256:revision-1",
		GeneratedAt:   now.Add(-time.Second),
		ValidUntil:    validUntil,
		Policies: []Policy{{
			ID: "p-allow", TenantID: "t1", PrincipalID: "agent-1", Action: "read",
			Resource: "reports/1", Effect: "ALLOW", ValidFrom: now.Add(-time.Hour),
		}},
	}
	if err := c.ReplaceSnapshot(snapshot); err != nil {
		t.Fatal(err)
	}

	allowed := c.Evaluate(Request{TenantID: "t1", PrincipalID: "agent-1", Action: "read", Resource: "reports/1"}, now)
	if !allowed.Allowed || allowed.PolicyID != "p-allow" || allowed.Revision != snapshot.Revision {
		t.Fatalf("expected matching rule to allow, got %+v", allowed)
	}
	for _, request := range []Request{
		{TenantID: "t1", PrincipalID: "agent-2", Action: "read", Resource: "reports/1"},
		{TenantID: "t1", PrincipalID: "agent-1", Action: "write", Resource: "reports/1"},
	} {
		if decision := c.Evaluate(request, now); decision.Allowed || decision.Reason != "POLICY_NOT_FOUND" {
			t.Fatalf("non-matching request must deny, got %+v", decision)
		}
	}
	if c.Evaluate(Request{}, validUntil).Reason != "POLICY_SNAPSHOT_EXPIRED" {
		t.Fatal("expired snapshot must deny")
	}
}

func TestReplaceSnapshotCopiesInputAndRejectsDuplicates(t *testing.T) {
	now := time.Now().UTC()
	policy := Policy{ID: "p1", TenantID: "t", PrincipalID: "a", Action: "read", Resource: "x", Effect: "ALLOW", ValidFrom: now.Add(-time.Minute)}
	snapshot := Snapshot{SchemaVersion: 1, Revision: "r1", GeneratedAt: now.Add(-time.Second), ValidUntil: now.Add(time.Minute), Policies: []Policy{policy}}
	c := &PolicyCache{}
	if err := c.ReplaceSnapshot(snapshot); err != nil {
		t.Fatal(err)
	}
	snapshot.Policies[0].Effect = "DENY"
	if d := c.Evaluate(Request{TenantID: "t", PrincipalID: "a", Action: "read", Resource: "x"}, now); !d.Allowed {
		t.Fatalf("mutating source snapshot changed published cache: %+v", d)
	}

	bad := Snapshot{SchemaVersion: 1, Revision: "r2", GeneratedAt: now.Add(-time.Second), ValidUntil: now.Add(time.Minute), Policies: []Policy{policy, policy}}
	if err := c.ReplaceSnapshot(bad); !errors.Is(err, ErrInvalidSnapshot) {
		t.Fatalf("expected duplicate snapshot rejection, got %v", err)
	}
	if d := c.Evaluate(Request{TenantID: "t", PrincipalID: "a", Action: "read", Resource: "x"}, now); !d.Allowed || d.Revision != "r1" {
		t.Fatalf("invalid update replaced prior snapshot: %+v", d)
	}
}

func TestPolicyDeniesWhenEffectOrPolicyValidityDoesNotAllow(t *testing.T) {
	now := time.Now().UTC()
	policyEnd := now
	c := &PolicyCache{}
	for _, effect := range []string{"DENY", "ALLOW"} {
		p := Policy{ID: "p", TenantID: "t", PrincipalID: "a", Action: "read", Resource: "x", Effect: effect, ValidFrom: now.Add(-time.Hour)}
		if effect == "ALLOW" {
			p.ValidUntil = &policyEnd
		}
		if err := c.ReplaceSnapshot(Snapshot{SchemaVersion: 1, Revision: effect, GeneratedAt: now.Add(-time.Second), ValidUntil: now.Add(time.Minute), Policies: []Policy{p}}); err != nil {
			t.Fatal(err)
		}
		d := c.Evaluate(Request{TenantID: "t", PrincipalID: "a", Action: "read", Resource: "x"}, now)
		if d.Allowed {
			t.Fatalf("effect %s / expired policy must deny: %+v", effect, d)
		}
	}
}

func TestSharedAuthorizationFixtures(t *testing.T) {
	var fixtures []struct {
		Name               string    `json:"name"`
		Now                time.Time `json:"now"`
		SnapshotValidUntil time.Time `json:"snapshot_valid_until"`
		Request            struct {
			TenantID    string `json:"tenant_id"`
			PrincipalID string `json:"principal_id"`
			Action      string `json:"action"`
			Resource    string `json:"resource"`
		} `json:"request"`
		Policies []Policy `json:"policies"`
		Expected struct {
			Decision string `json:"decision"`
			Reason   string `json:"reason"`
			PolicyID string `json:"policy_id"`
		} `json:"expected"`
	}

	fixturePath := filepath.Join("..", "..", "tests", "fixtures", "authorization-policy-cases.json")
	data, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Fatalf("read shared authorization fixtures: %v", err)
	}
	if err := json.Unmarshal(data, &fixtures); err != nil {
		t.Fatalf("decode shared authorization fixtures: %v", err)
	}
	if len(fixtures) == 0 {
		t.Fatal("shared authorization fixtures must not be empty")
	}

	for _, fixture := range fixtures {
		t.Run(fixture.Name, func(t *testing.T) {
			policyCache := &PolicyCache{}
			err := policyCache.ReplaceSnapshot(Snapshot{
				SchemaVersion: 1,
				Revision:      "sha256:shared-fixtures",
				GeneratedAt:   fixture.Now.Add(-time.Minute),
				ValidUntil:    fixture.SnapshotValidUntil,
				Policies:      fixture.Policies,
			})
			if err != nil {
				t.Fatalf("publish fixture snapshot: %v", err)
			}

			decision := policyCache.Evaluate(Request{
				TenantID:    fixture.Request.TenantID,
				PrincipalID: fixture.Request.PrincipalID,
				Action:      fixture.Request.Action,
				Resource:    fixture.Request.Resource,
			}, fixture.Now)
			wantAllowed := fixture.Expected.Decision == "ALLOW"
			if decision.Allowed != wantAllowed || decision.Reason != fixture.Expected.Reason || decision.PolicyID != fixture.Expected.PolicyID {
				t.Fatalf("got decision %+v; want decision=%s reason=%s policy_id=%s", decision, fixture.Expected.Decision, fixture.Expected.Reason, fixture.Expected.PolicyID)
			}
		})
	}
}
