package gateway

import (
	"errors"
	"sync"
	"sync/atomic"
	"testing"
)

func TestWorkerPoolRejectsInvalidConfigurationAndNilTasks(t *testing.T) {
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
			pool, err := NewWorkerPool(test.workers, test.queueSize)
			if pool != nil || !errors.Is(err, ErrInvalidPoolConfig) {
				t.Fatalf("expected ErrInvalidPoolConfig, got pool=%v, err=%v", pool, err)
			}
		})
	}

	pool, err := NewWorkerPool(1, 1)
	if err != nil {
		t.Fatalf("NewWorkerPool() error = %v", err)
	}
	defer pool.Stop()
	if err := pool.Submit(nil); !errors.Is(err, ErrNilTask) {
		t.Fatalf("expected ErrNilTask, got %v", err)
	}
}

func TestWorkerPoolStopIsSafeWithConcurrentSubmissions(t *testing.T) {
	pool, err := NewWorkerPool(1, 8)
	if err != nil {
		t.Fatalf("NewWorkerPool() error = %v", err)
	}

	block := make(chan struct{})
	started := make(chan struct{})
	if err := pool.Submit(func() {
		close(started)
		<-block
	}); err != nil {
		t.Fatalf("could not submit blocking task: %v", err)
	}
	<-started

	var accepted atomic.Int64
	var completed atomic.Int64
	start := make(chan struct{})
	var submitters sync.WaitGroup
	for i := 0; i < 8; i++ {
		submitters.Add(1)
		go func() {
			defer submitters.Done()
			<-start
			for j := 0; j < 100; j++ {
				err := pool.Submit(func() { completed.Add(1) })
				if err == nil {
					accepted.Add(1)
					continue
				}
				if !errors.Is(err, ErrQueueFull) && !errors.Is(err, ErrPoolStopped) {
					t.Errorf("unexpected Submit() error: %v", err)
				}
			}
		}()
	}

	var stoppers sync.WaitGroup
	for i := 0; i < 3; i++ {
		stoppers.Add(1)
		go func() {
			defer stoppers.Done()
			<-start
			pool.Stop()
		}()
	}

	close(start)
	close(block)
	submitters.Wait()
	stoppers.Wait()

	if got, want := completed.Load(), accepted.Load(); got != want {
		t.Fatalf("Stop did not drain accepted tasks: completed=%d, accepted=%d", got, want)
	}
	if err := pool.Submit(func() {}); !errors.Is(err, ErrPoolStopped) {
		t.Fatalf("expected ErrPoolStopped after shutdown, got %v", err)
	}

	// Repeated shutdown is intentionally safe.
	pool.Stop()
}
