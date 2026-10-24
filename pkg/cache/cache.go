package cache

import "sync/atomic"

type Policy struct {
	ID    string
	Allow bool
}

type PolicyCache struct {
	// Armazena de forma atômica um map[string]*Policy
	store atomic.Value
}

// UpdatePolicies realiza a gravação atômica sem travar leitores (RCU)
func (c *PolicyCache) UpdatePolicies(newPolicies map[string]*Policy) {
	c.store.Store(newPolicies)
}

// GetPolicy realiza leitura lock-free e instantânea
func (c *PolicyCache) GetPolicy(id string) (*Policy, bool) {
	currMap, ok := c.store.Load().(map[string]*Policy)
	if !ok || currMap == nil {
		return nil, false
	}
	p, exists := currMap[id]
	return p, exists
}
