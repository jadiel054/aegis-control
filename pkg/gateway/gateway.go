package gateway

import (
	"context"
	"errors"
	"sync"
	"time"

	"aegis-control/pkg/cache"
)

var (
	ErrConnectionClosed = errors.New("gRPC connection closed: failing closed")
	ErrPolicyNotFound   = errors.New("policy not found in local cache")
	ErrAccessDenied     = errors.New("access denied (fail-closed)")
	ErrQueueFull        = errors.New("worker pool queue full: request rejected")
)

// WorkerPool limits goroutines handling downstream gRPC requests.
type WorkerPool struct {
	tasks chan func()
	wg    sync.WaitGroup
}

func NewWorkerPool(workers int, queueSize int) *WorkerPool {
	pool := &WorkerPool{
		tasks: make(chan func(), queueSize),
	}
	for i := 0; i < workers; i++ {
		pool.wg.Add(1)
		go func() {
			defer pool.wg.Done()
			for task := range pool.tasks {
				task()
			}
		}()
	}
	return pool
}

func (wp *WorkerPool) Submit(task func()) bool {
	select {
	case wp.tasks <- task:
		return true
	default:
		return false
	}
}

func (wp *WorkerPool) Stop() {
	close(wp.tasks)
	wp.wg.Wait()
}

// AgentGatewayHandler handles incoming gateway requests with universal timeout and worker pool.
type AgentGatewayHandler struct {
	pool        *WorkerPool
	cache       *cache.PolicyCache
	isConnAlive bool
	mu          sync.RWMutex
}

func NewAgentGatewayHandler(workers, queueSize int, policyCache *cache.PolicyCache) *AgentGatewayHandler {
	return &AgentGatewayHandler{
		pool:        NewWorkerPool(workers, queueSize),
		cache:       policyCache,
		isConnAlive: true,
	}
}

func (h *AgentGatewayHandler) SetConnectionState(alive bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.isConnAlive = alive
}

func (h *AgentGatewayHandler) IsConnectionAlive() bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.isConnAlive
}

// EvaluateAccess evaluates access with universal context timeout and fail-closed strategy.
func (h *AgentGatewayHandler) EvaluateAccess(ctx context.Context, policyID string, timeout time.Duration) (bool, error) {
	ctxTimeout, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	type result struct {
		allow bool
		err   error
	}
	resChan := make(chan result, 1)

	submitted := h.pool.Submit(func() {
		// O worker respeita o cancelamento do contexto: se o prazo estourou,
		// abandona o trabalho imediatamente em vez de desperdiçar a pool.
		select {
		case <-ctxTimeout.Done():
			resChan <- result{allow: false, err: ctxTimeout.Err()}
			return
		default:
		}

		// Semântica única para ambos os estados: a decisão sai SEMPRE do cache local.
		// A diferença é apenas o erro reportado — em partição de rede, uma política
		// ausente do cache é tratada como acesso negado (fail-closed), nunca como
		// "não encontrado" transitório.
		p, exists := h.cache.GetPolicy(policyID)
		if !exists || p == nil {
			if h.IsConnectionAlive() {
				resChan <- result{allow: false, err: ErrPolicyNotFound}
			} else {
				resChan <- result{allow: false, err: ErrAccessDenied}
			}
			return
		}
		if !p.Allow {
			resChan <- result{allow: false, err: ErrAccessDenied}
			return
		}
		resChan <- result{allow: true, err: nil}
	})

	if !submitted {
		return false, ErrQueueFull
	}

	select {
	case <-ctxTimeout.Done():
		return false, ctxTimeout.Err()
	case res := <-resChan:
		return res.allow, res.err
	}
}

func (h *AgentGatewayHandler) Stop() {
	h.pool.Stop()
}
