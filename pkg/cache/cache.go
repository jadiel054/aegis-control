package cache

import "sync/atomic"

type Policy struct {
	ID    string
	Allow bool
}

type PolicyCache struct {
	// Armazena snapshots imutáveis de forma atômica.
	// Não copie PolicyCache depois do primeiro uso.
	store atomic.Value
}

// UpdatePolicies publica uma cópia independente das políticas recebidas.
// O chamador não deve modificar o mapa enquanto esta função o percorre; após
// o retorno, alterações posteriores no mapa ou nos objetos de origem não afetam
// o snapshot armazenado. Um mapa nil ou vazio limpa o cache.
func (c *PolicyCache) UpdatePolicies(newPolicies map[string]*Policy) {
	snapshot := make(map[string]*Policy, len(newPolicies))
	for id, policy := range newPolicies {
		if policy == nil {
			snapshot[id] = nil
			continue
		}
		copy := *policy
		snapshot[id] = &copy
	}
	c.store.Store(snapshot)
}

// GetPolicy realiza leitura lock-free e instantânea.
// Retorna uma cópia defensiva: mutar o ponteiro retornado não altera o cache.
func (c *PolicyCache) GetPolicy(id string) (*Policy, bool) {
	currMap, ok := c.store.Load().(map[string]*Policy)
	if !ok || currMap == nil {
		return nil, false
	}
	policy, exists := currMap[id]
	if !exists || policy == nil {
		return nil, false
	}
	copy := *policy
	return &copy, true
}
