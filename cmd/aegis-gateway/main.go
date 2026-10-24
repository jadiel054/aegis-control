package main

import (
	"context"
	"crypto/tls"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"aegis-control/internal/grpcserver"
	"aegis-control/internal/snapshotclient"
	"aegis-control/pkg/cache"
	"aegis-control/pkg/gateway"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
)

const serviceName = "aegis.authorization.v1.AuthorizationService"

func required(name string) (string, error) {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return "", fmt.Errorf("%s is required", name)
	}
	return value, nil
}

func positiveInt(name string, fallback, maximum int) (int, error) {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < 1 || value > maximum {
		return 0, fmt.Errorf("%s must be between 1 and %d", name, maximum)
	}
	return value, nil
}

func run() error {
	listenAddr := os.Getenv("AEGIS_GRPC_LISTEN_ADDR")
	if listenAddr == "" {
		listenAddr = "127.0.0.1:50051"
	}
	endpoint, err := required("AEGIS_POLICY_SNAPSHOT_URL")
	if err != nil {
		return err
	}
	snapshotURL, err := url.ParseRequestURI(endpoint)
	if err != nil || snapshotURL.Host == "" || snapshotURL.User != nil {
		return fmt.Errorf("AEGIS_POLICY_SNAPSHOT_URL must be an absolute URL without user info")
	}
	loopback := snapshotURL.Hostname() == "localhost"
	if ip := net.ParseIP(snapshotURL.Hostname()); ip != nil && ip.IsLoopback() {
		loopback = true
	}
	if snapshotURL.Scheme != "https" && !(snapshotURL.Scheme == "http" && loopback) {
		return fmt.Errorf("AEGIS_POLICY_SNAPSHOT_URL must use HTTPS (HTTP is allowed only for localhost)")
	}
	syncSecret, err := required("AEGIS_POLICY_SNAPSHOT_SECRET")
	if err != nil || len(syncSecret) < 32 {
		return fmt.Errorf("AEGIS_POLICY_SNAPSHOT_SECRET must contain at least 32 characters")
	}
	apiToken, err := required("AEGIS_GRPC_API_KEY")
	if err != nil || len(apiToken) < 32 {
		return fmt.Errorf("AEGIS_GRPC_API_KEY must contain at least 32 characters")
	}
	certFile, err := required("AEGIS_GRPC_TLS_CERT_FILE")
	if err != nil {
		return err
	}
	keyFile, err := required("AEGIS_GRPC_TLS_KEY_FILE")
	if err != nil {
		return err
	}
	refreshInterval := 10 * time.Second
	if raw := os.Getenv("AEGIS_POLICY_REFRESH_INTERVAL"); raw != "" {
		refreshInterval, err = time.ParseDuration(raw)
		if err != nil || refreshInterval < time.Second || refreshInterval > time.Minute {
			return fmt.Errorf("AEGIS_POLICY_REFRESH_INTERVAL must be between 1s and 1m")
		}
	}
	workers, err := positiveInt("AEGIS_GATEWAY_WORKERS", 8, 256)
	if err != nil {
		return err
	}
	queueSize, err := positiveInt("AEGIS_GATEWAY_QUEUE_SIZE", 128, 10000)
	if err != nil {
		return err
	}
	cert, err := tls.LoadX509KeyPair(certFile, keyFile)
	if err != nil {
		return fmt.Errorf("load gRPC TLS key pair: %w", err)
	}

	policyCache := &cache.PolicyCache{}
	evaluator, err := gateway.NewAgentGatewayHandler(workers, queueSize, policyCache)
	if err != nil {
		return fmt.Errorf("create authorization evaluator: %w", err)
	}
	defer evaluator.Stop()
	healthServer := health.NewServer()
	healthServer.SetServingStatus("", healthpb.HealthCheckResponse_NOT_SERVING)
	healthServer.SetServingStatus(serviceName, healthpb.HealthCheckResponse_NOT_SERVING)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	refresh := func() {
		fetchCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		defer cancel()
		snapshot, fetchErr := snapshotclient.Fetch(fetchCtx, endpoint, syncSecret, &http.Client{Timeout: 5 * time.Second})
		if fetchErr == nil {
			fetchErr = policyCache.ReplaceSnapshot(snapshot)
		}
		if fetchErr != nil {
			log.Printf("policy snapshot refresh failed: %v", fetchErr)
		} else {
			log.Printf("policy snapshot refreshed: revision=%s policies=%d", snapshot.Revision, len(snapshot.Policies))
		}
	}
	refresh()
	go func() {
		ticker := time.NewTicker(refreshInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				refresh()
			}
		}
	}()
	go func() {
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				state := healthpb.HealthCheckResponse_NOT_SERVING
				if policyCache.Ready(time.Now().UTC()) {
					state = healthpb.HealthCheckResponse_SERVING
				}
				healthServer.SetServingStatus("", state)
				healthServer.SetServingStatus(serviceName, state)
			}
		}
	}()

	listener, err := net.Listen("tcp", listenAddr)
	if err != nil {
		return fmt.Errorf("listen on %s: %w", listenAddr, err)
	}
	server := grpcserver.NewServer(evaluator, apiToken, grpc.Creds(credentials.NewTLS(&tls.Config{
		Certificates: []tls.Certificate{cert}, MinVersion: tls.VersionTLS12,
	})))
	healthpb.RegisterHealthServer(server, healthServer)
	serveErr := make(chan error, 1)
	go func() { serveErr <- server.Serve(listener) }()
	log.Printf("Aegis authorization gRPC server listening on %s", listenAddr)
	select {
	case <-ctx.Done():
		stopped := make(chan struct{})
		go func() { server.GracefulStop(); close(stopped) }()
		select {
		case <-stopped:
		case <-time.After(10 * time.Second):
			server.Stop()
		}
		return nil
	case err := <-serveErr:
		if err != nil {
			return fmt.Errorf("serve gRPC: %w", err)
		}
		return nil
	}
}

func main() {
	if err := run(); err != nil {
		log.Printf("aegis gateway stopped: %v", err)
		os.Exit(1)
	}
}
