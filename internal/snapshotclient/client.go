package snapshotclient

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"aegis-control/pkg/cache"
)

const maxSnapshotBytes = 8 << 20

// Fetch retrieves and validates the JSON snapshot contract returned by Next.js.
func Fetch(ctx context.Context, endpoint, secret string, client *http.Client) (cache.Snapshot, error) {
	var empty cache.Snapshot
	if strings.TrimSpace(endpoint) == "" || len(secret) < 32 {
		return empty, fmt.Errorf("snapshot endpoint and a 32-character sync secret are required")
	}
	if client == nil {
		client = http.DefaultClient
	}
	requestClient := *client
	requestClient.CheckRedirect = func(*http.Request, []*http.Request) error {
		return http.ErrUseLastResponse
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return empty, fmt.Errorf("create snapshot request: %w", err)
	}
	req.Header.Set("x-aegis-gateway-secret", secret)
	resp, err := requestClient.Do(req)
	if err != nil {
		return empty, fmt.Errorf("fetch policy snapshot: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
		return empty, fmt.Errorf("snapshot endpoint returned status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxSnapshotBytes+1))
	if err != nil {
		return empty, fmt.Errorf("read policy snapshot: %w", err)
	}
	if len(body) > maxSnapshotBytes {
		return empty, fmt.Errorf("policy snapshot exceeds %d bytes", maxSnapshotBytes)
	}
	decoder := json.NewDecoder(strings.NewReader(string(body)))
	decoder.DisallowUnknownFields()
	var snapshot cache.Snapshot
	if err := decoder.Decode(&snapshot); err != nil {
		return empty, fmt.Errorf("decode policy snapshot: %w", err)
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return empty, fmt.Errorf("policy snapshot contains trailing data")
	}
	return snapshot, nil
}
