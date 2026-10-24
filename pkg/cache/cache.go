package cache

import (
	"errors"
	"fmt"
	"strings"
	"sync/atomic"
	"time"
)

var ErrInvalidSnapshot = errors.New("invalid policy snapshot")

type Policy struct {
	ID          string     `json:"policy_id"`
	TenantID    string     `json:"tenant_id"`
	PrincipalID string     `json:"principal_id"`
	Action      string     `json:"action"`
	Resource    string     `json:"resource"`
	Effect      string     `json:"effect"`
	Allow       bool       `json:"-"`
	ValidFrom   time.Time  `json:"valid_from"`
	ValidUntil  *time.Time `json:"valid_until"`
}

type Snapshot struct {
	SchemaVersion int       `json:"schema_version"`
	Revision      string    `json:"revision"`
	GeneratedAt   time.Time `json:"generated_at"`
	ValidUntil    time.Time `json:"valid_until"`
	Policies      []Policy  `json:"policies"`
}

type Request struct {
	TenantID    string
	PrincipalID string
	Action      string
	Resource    string
}

type Decision struct {
	Allowed  bool
	Reason   string
	PolicyID string
	Revision string
}

type policyKey struct {
	tenantID, principalID, action, resource string
}

type cacheState struct {
	byID        map[string]*Policy
	byRequest   map[policyKey]*Policy
	revision    string
	validUntil  time.Time
	hasSnapshot bool
}

type PolicyCache struct {
	// Never copy PolicyCache after its first use.
	store atomic.Pointer[cacheState]
}

// ReplaceSnapshot validates and atomically publishes a copied snapshot. Duplicate
// exact-match rules are rejected rather than being resolved by map order.
func (c *PolicyCache) ReplaceSnapshot(snapshot Snapshot) error {
	if snapshot.SchemaVersion != 1 || strings.TrimSpace(snapshot.Revision) == "" ||
		snapshot.GeneratedAt.IsZero() || !snapshot.ValidUntil.After(snapshot.GeneratedAt) {
		return ErrInvalidSnapshot
	}

	state := &cacheState{
		byID:        make(map[string]*Policy, len(snapshot.Policies)),
		byRequest:   make(map[policyKey]*Policy, len(snapshot.Policies)),
		revision:    snapshot.Revision,
		validUntil:  snapshot.ValidUntil,
		hasSnapshot: true,
	}
	for _, source := range snapshot.Policies {
		p := source
		if strings.TrimSpace(p.ID) == "" || strings.TrimSpace(p.TenantID) == "" ||
			strings.TrimSpace(p.PrincipalID) == "" || strings.TrimSpace(p.Action) == "" ||
			strings.TrimSpace(p.Resource) == "" || p.ValidFrom.IsZero() ||
			(p.Effect != "ALLOW" && p.Effect != "DENY") {
			return fmt.Errorf("%w: missing field or unsupported effect", ErrInvalidSnapshot)
		}
		if p.ValidUntil != nil && !p.ValidUntil.After(p.ValidFrom) {
			return fmt.Errorf("%w: policy validity window is empty", ErrInvalidSnapshot)
		}
		key := keyFor(Request{TenantID: p.TenantID, PrincipalID: p.PrincipalID, Action: p.Action, Resource: p.Resource})
		if _, exists := state.byID[p.ID]; exists {
			return fmt.Errorf("%w: duplicate policy id", ErrInvalidSnapshot)
		}
		if _, exists := state.byRequest[key]; exists {
			return fmt.Errorf("%w: duplicate exact-match rule", ErrInvalidSnapshot)
		}
		if p.ValidUntil != nil {
			validUntil := *p.ValidUntil
			p.ValidUntil = &validUntil
		}
		p.Allow = p.Effect == "ALLOW"
		state.byID[p.ID] = &p
		state.byRequest[key] = &p
	}
	c.store.Store(state)
	return nil
}

// UpdatePolicies remains available for the original ID-only library API. Such
// data is not a valid authorization snapshot and Evaluate will fail closed.
func (c *PolicyCache) UpdatePolicies(newPolicies map[string]*Policy) {
	state := &cacheState{byID: make(map[string]*Policy, len(newPolicies)), byRequest: map[policyKey]*Policy{}}
	for id, policy := range newPolicies {
		if policy == nil {
			continue
		}
		copy := *policy
		if copy.ValidUntil != nil {
			validUntil := *copy.ValidUntil
			copy.ValidUntil = &validUntil
		}
		state.byID[id] = &copy
	}
	c.store.Store(state)
}

// GetPolicy returns a defensive copy for legacy ID-based callers.
func (c *PolicyCache) GetPolicy(id string) (*Policy, bool) {
	state := c.store.Load()
	if state == nil {
		return nil, false
	}
	policy, exists := state.byID[id]
	if !exists || policy == nil {
		return nil, false
	}
	copy := *policy
	if copy.ValidUntil != nil {
		validUntil := *copy.ValidUntil
		copy.ValidUntil = &validUntil
	}
	return &copy, true
}

// Evaluate returns DENY for an unavailable/stale snapshot, absent policy, or
// policy outside its own validity window.
func (c *PolicyCache) Evaluate(request Request, now time.Time) Decision {
	state := c.store.Load()
	if state == nil || !state.hasSnapshot {
		return Decision{Reason: "POLICY_SNAPSHOT_UNAVAILABLE"}
	}
	if !now.Before(state.validUntil) {
		return Decision{Reason: "POLICY_SNAPSHOT_EXPIRED", Revision: state.revision}
	}
	policy, exists := state.byRequest[keyFor(request)]
	if !exists {
		return Decision{Reason: "POLICY_NOT_FOUND", Revision: state.revision}
	}
	decision := Decision{PolicyID: policy.ID, Revision: state.revision}
	if now.Before(policy.ValidFrom) {
		decision.Reason = "POLICY_NOT_ACTIVE"
		return decision
	}
	if policy.ValidUntil != nil && !now.Before(*policy.ValidUntil) {
		decision.Reason = "POLICY_EXPIRED"
		return decision
	}
	if policy.Effect != "ALLOW" {
		decision.Reason = "POLICY_DENIED"
		return decision
	}
	decision.Allowed = true
	decision.Reason = "ALLOW"
	return decision
}

func (c *PolicyCache) Ready(now time.Time) bool {
	state := c.store.Load()
	return state != nil && state.hasSnapshot && now.Before(state.validUntil)
}

func keyFor(request Request) policyKey {
	return policyKey{request.TenantID, request.PrincipalID, request.Action, request.Resource}
}
