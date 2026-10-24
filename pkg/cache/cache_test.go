package cache

import "testing"
import "fmt"
import "sync"

func TestConcurrentPolicyCache(t *testing.T) {
	c := &PolicyCache{}

	initialPolicies := map[string]*Policy{
		"p1": {ID: "p1", Allow: true},
		"p2": {ID: "p2", Allow: false},
	}
	c.UpdatePolicies(initialPolicies)

	var wg sync.WaitGroup
	numReaders := 1000
	numWriters := 100

	// Launch 1000 reader goroutines
	for i := 0; i < numReaders; i++ {
		wg.Add(1)
		go func(readerID int) {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				p, exists := c.GetPolicy("p1")
				if exists && p == nil {
					t.Errorf("reader %d: expected non-nil policy", readerID)
				}
			}
		}(i)
	}

	// Launch 100 writer goroutines
	for i := 0; i < numWriters; i++ {
		wg.Add(1)
		go func(writerID int) {
			defer wg.Done()
			for j := 0; j < 10; j++ {
				newMap := map[string]*Policy{
					"p1": {ID: "p1", Allow: writerID%2 == 0},
					"p2": {ID: "p2", Allow: true},
					fmt.Sprintf("p_write_%d_%d", writerID, j): {ID: fmt.Sprintf("p_write_%d_%d", writerID, j), Allow: true},
				}
				c.UpdatePolicies(newMap)
			}
		}(i)
	}

	wg.Wait()
}
