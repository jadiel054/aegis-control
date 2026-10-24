package snapshotclient

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

const testSecret = "snapshot-test-secret-with-over-thirty-two-characters"

func TestFetchUsesServiceSecretAndDecodesSnapshot(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("x-aegis-gateway-secret") != testSecret {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"schema_version":1,"revision":"r1","generated_at":"2026-10-24T12:00:00Z","valid_until":"2026-10-24T12:00:30Z","policies":[{"policy_id":"p1","tenant_id":"t1","principal_id":"a1","action":"read","resource":"reports/1","effect":"ALLOW","valid_from":"2026-10-24T11:00:00Z","valid_until":null}]}`))
	}))
	defer server.Close()
	snapshot, err := Fetch(context.Background(), server.URL, testSecret, server.Client())
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Revision != "r1" || len(snapshot.Policies) != 1 || snapshot.Policies[0].ID != "p1" || snapshot.Policies[0].Effect != "ALLOW" {
		t.Fatalf("unexpected decoded snapshot: %+v", snapshot)
	}
	if want := time.Date(2026, 10, 24, 12, 0, 30, 0, time.UTC); !snapshot.ValidUntil.Equal(want) {
		t.Fatalf("valid_until = %s, want %s", snapshot.ValidUntil, want)
	}
}

func TestFetchDoesNotFollowCrossOriginRedirect(t *testing.T) {
	var targetReached atomic.Bool
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		targetReached.Store(true)
		w.WriteHeader(http.StatusOK)
	}))
	defer target.Close()

	redirector := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("x-aegis-gateway-secret") != testSecret {
			t.Errorf("redirect source did not receive the expected secret header")
		}
		http.Redirect(w, r, target.URL, http.StatusFound)
	}))
	defer redirector.Close()

	if _, err := Fetch(context.Background(), redirector.URL, testSecret, redirector.Client()); err == nil {
		t.Fatal("expected redirect response to be rejected")
	}
	if targetReached.Load() {
		t.Fatal("snapshot client followed cross-origin redirect")
	}
}

func TestFetchRejectsUnauthorizedResponseAndUnknownFields(t *testing.T) {
	unauthorized := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusUnauthorized) }))
	if _, err := Fetch(context.Background(), unauthorized.URL, testSecret, unauthorized.Client()); err == nil {
		t.Fatal("expected unauthorized status error")
	}
	unauthorized.Close()

	unknownField := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"schema_version":1,"revision":"r1","generated_at":"2026-10-24T12:00:00Z","valid_until":"2026-10-24T12:00:30Z","policies":[],"unexpected":true}`))
	}))
	defer unknownField.Close()
	if _, err := Fetch(context.Background(), unknownField.URL, testSecret, unknownField.Client()); err == nil {
		t.Fatal("expected strict decoder to reject unknown field")
	}
}
