package gateway

import (
	"context"
	"errors"
	"sync"
	"time"

	"aegis-control/pkg/cache"
)

var (
	ErrConnectionClosed  = errors.New("gRPC connection closed: failing closed")
	ErrPolicyNotFound    = errors.New("policy not found in local cache")
	ErrAccessDenied      = errors.New("access denied (fail-closed)")
	ErrQueueFull         = errors.New("worker pool queue full: request rejected")
	ErrPoolStopped       = errors.New("worker pool is stopped")
	ErrInvalidPoolConfig = errors.New("worker pool requires workers > 0 and queueSize >= 0")
	ErrNilTask           = errors.New("worker pool task must not be nil")
	ErrNilPolicyCache    = errors.New("policy cache must not be nil")
	ErrNilContext        = errors.New("context must not be nil")
)

// WorkerPool limits goroutines handling downstream requests.
type WorkerPool struct {
	tasks   chan func()
	wg      sync.WaitGroup
	mu      sync.Mutex
	stopped bool
}

func NewWorkerPool(workers int, queueSize int) (*WorkerPool, error) {
	if workers <= 0 || queueSize < 0 {
		return nil, ErrInvalidPoolConfig
	}

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
	return pool, nil
}

// Submit enqueues a task without blocking. It returns ErrQueueFull when the
// queue has no capacity and ErrPoolStopped after shutdown has begun.
func (wp *WorkerPool) Submit(task func()) error {
	if task == nil {
		return ErrNilTask
	}

	wp.mu.Lock()
	defer wp.mu.Unlock()
	if wp.stopped {
		return ErrPoolStopped
	}

	select {
	case wp.tasks <- task:
		return nil
	default:
		return ErrQueueFull
	}
}

// Stop is idempotent, prevents new submissions, drains accepted tasks, and
// waits for workers to finish. Submitted tasks must not block indefinitely.
func (wp *WorkerPool) Stop() {
	wp.mu.Lock()
	if !wp.stopped {
		wp.stopped = true
		close(wp.tasks)
	}
	wp.mu.Unlock()
	wp.wg.Wait()
}

// AgentGatewayHandler evaluates incoming requests with a context timeout and
// a fail-closed local-policy fallback.
type AgentGatewayHandler struct {
	pool        *WorkerPool
	cache       *cache.PolicyCache
	isConnAlive bool
	mu          sync.RWMutex
}

func NewAgentGatewayHandler(workers, queueSize int, policyCache *cache.PolicyCache) (*AgentGatewayHandler, error) {
	if policyCache == nil {
		return nil, ErrNilPolicyCache
	}
	pool, err := NewWorkerPool(workers, queueSize)
	if err != nil {
		return nil, err
	}
	return &AgentGatewayHandler{
		pool:        pool,
		cache:       policyCache,
		isConnAlive: true,
	}, nil
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

// EvaluateAccess evaluates access with a timeout. A context cancellation or
// deadline that is visible when the result is received takes precedence over
// the policy result.
func (h *AgentGatewayHandler) EvaluateAccess(ctx context.Context, policyID string, timeout time.Duration) (bool, error) {
	if ctx == nil {
		return false, ErrNilContext
	}

	ctxTimeout, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	if err := ctxTimeout.Err(); err != nil {
		return false, err
	}

	type result struct {
		allow bool
		err   error
	}
	resChan := make(chan result, 1)

	err := h.pool.Submit(func() {
		if err := ctxTimeout.Err(); err != nil {
			resChan <- result{allow: false, err: err}
			return
		}

		// A decisão vem sempre do cache local. Em partição, uma política
		// ausente é negada, nunca tratada como uma permissão transitória.
		policy, exists := h.cache.GetPolicy(policyID)
		if !exists || policy == nil {
			if h.IsConnectionAlive() {
				resChan <- result{allow: false, err: ErrPolicyNotFound}
			} else {
				resChan <- result{allow: false, err: ErrAccessDenied}
			}
			return
		}
		if !policy.Allow {
			resChan <- result{allow: false, err: ErrAccessDenied}
			return
		}
		resChan <- result{allow: true}
	})
	if err != nil {
		if timeoutErr := ctxTimeout.Err(); timeoutErr != nil {
			return false, timeoutErr
		}
		return false, err
	}

	select {
	case <-ctxTimeout.Done():
		return false, ctxTimeout.Err()
	case res := <-resChan:
		if err := ctxTimeout.Err(); err != nil {
			return false, err
		}
		return res.allow, res.err
	}
}

func (h *AgentGatewayHandler) Stop() {
	h.pool.Stop()
}
