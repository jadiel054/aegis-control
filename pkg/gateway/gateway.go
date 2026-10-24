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
	ErrInvalidTimeout    = errors.New("timeout must be greater than zero")
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
	pool := &WorkerPool{tasks: make(chan func(), queueSize)}
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

// AgentGatewayHandler evaluates requests against the immutable local cache.
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
	return &AgentGatewayHandler{pool: pool, cache: policyCache, isConnAlive: true}, nil
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

// EvaluateAccess retains the original policy-ID API for existing consumers.
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
			resChan <- result{err: err}
			return
		}
		policy, exists := h.cache.GetPolicy(policyID)
		if !exists || policy == nil {
			if h.IsConnectionAlive() {
				resChan <- result{err: ErrPolicyNotFound}
				return
			}
			resChan <- result{err: ErrAccessDenied}
			return
		}
		if !policy.Allow {
			resChan <- result{err: ErrAccessDenied}
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

// EvaluateRequest evaluates an exact-match request through the bounded worker
// pool. Policy denials are decisions; overload and deadline failures are errors.
func (h *AgentGatewayHandler) EvaluateRequest(ctx context.Context, request cache.Request, timeout time.Duration) (cache.Decision, error) {
	if ctx == nil {
		return cache.Decision{}, ErrNilContext
	}
	if timeout <= 0 {
		return cache.Decision{}, ErrInvalidTimeout
	}
	ctxTimeout, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	if err := ctxTimeout.Err(); err != nil {
		return cache.Decision{}, err
	}
	type result struct {
		decision cache.Decision
		err      error
	}
	resultChan := make(chan result, 1)
	err := h.pool.Submit(func() {
		if err := ctxTimeout.Err(); err != nil {
			resultChan <- result{err: err}
			return
		}
		decision := h.cache.Evaluate(request, time.Now().UTC())
		if err := ctxTimeout.Err(); err != nil {
			resultChan <- result{err: err}
			return
		}
		resultChan <- result{decision: decision}
	})
	if err != nil {
		if timeoutErr := ctxTimeout.Err(); timeoutErr != nil {
			return cache.Decision{}, timeoutErr
		}
		return cache.Decision{}, err
	}
	select {
	case <-ctxTimeout.Done():
		return cache.Decision{}, ctxTimeout.Err()
	case result := <-resultChan:
		if err := ctxTimeout.Err(); err != nil {
			return cache.Decision{}, err
		}
		return result.decision, result.err
	}
}

func (h *AgentGatewayHandler) Stop() {
	h.pool.Stop()
}
