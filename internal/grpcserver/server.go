package grpcserver

import (
	"context"
	"crypto/subtle"
	"errors"
	"strings"
	"time"

	authorizationv1 "aegis-control/gen/go/aegis/authorization/v1"
	"aegis-control/pkg/cache"
	"aegis-control/pkg/gateway"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

type authorizationService struct {
	authorizationv1.UnimplementedAuthorizationServiceServer
	evaluator interface {
		EvaluateRequest(context.Context, cache.Request, time.Duration) (cache.Decision, error)
	}
}

func NewServer(evaluator interface {
	EvaluateRequest(context.Context, cache.Request, time.Duration) (cache.Decision, error)
}, bearerToken string, options ...grpc.ServerOption) *grpc.Server {
	options = append(options, grpc.UnaryInterceptor(BearerTokenInterceptor(bearerToken)))
	server := grpc.NewServer(options...)
	authorizationv1.RegisterAuthorizationServiceServer(server, &authorizationService{evaluator: evaluator})
	return server
}

func BearerTokenInterceptor(expected string) grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
		if strings.HasPrefix(info.FullMethod, "/grpc.health.v1.Health/") {
			return handler(ctx, req)
		}
		if len(expected) < 32 {
			return nil, status.Error(codes.Unauthenticated, "service authentication is not configured")
		}
		md, ok := metadata.FromIncomingContext(ctx)
		if !ok {
			return nil, status.Error(codes.Unauthenticated, "missing service credentials")
		}
		values := md.Get("authorization")
		if len(values) != 1 || !strings.HasPrefix(values[0], "Bearer ") {
			return nil, status.Error(codes.Unauthenticated, "invalid service credentials")
		}
		provided := strings.TrimPrefix(values[0], "Bearer ")
		if len(provided) != len(expected) || subtle.ConstantTimeCompare([]byte(provided), []byte(expected)) != 1 {
			return nil, status.Error(codes.Unauthenticated, "invalid service credentials")
		}
		return handler(ctx, req)
	}
}

func (s *authorizationService) EvaluateAccess(ctx context.Context, req *authorizationv1.EvaluateAccessRequest) (*authorizationv1.EvaluateAccessResponse, error) {
	if req == nil || strings.TrimSpace(req.GetTenantId()) == "" || strings.TrimSpace(req.GetPrincipalId()) == "" ||
		strings.TrimSpace(req.GetAction()) == "" || strings.TrimSpace(req.GetResource()) == "" {
		return nil, status.Error(codes.InvalidArgument, "tenant_id, principal_id, action and resource are required")
	}
	for _, field := range []string{req.GetTenantId(), req.GetPrincipalId(), req.GetAction(), req.GetResource()} {
		if len(strings.TrimSpace(field)) > 512 {
			return nil, status.Error(codes.InvalidArgument, "authorization fields must not exceed 512 bytes")
		}
	}
	if len(req.GetRequestId()) > 128 {
		return nil, status.Error(codes.InvalidArgument, "request_id must not exceed 128 bytes")
	}
	if s.evaluator == nil {
		return nil, status.Error(codes.Unavailable, "authorization evaluator is unavailable")
	}
	decision, err := s.evaluator.EvaluateRequest(ctx, cache.Request{
		TenantID: strings.TrimSpace(req.GetTenantId()), PrincipalID: strings.TrimSpace(req.GetPrincipalId()),
		Action: strings.TrimSpace(req.GetAction()), Resource: strings.TrimSpace(req.GetResource()),
	}, 2*time.Second)
	if err != nil {
		switch {
		case errors.Is(err, context.DeadlineExceeded):
			return nil, status.Error(codes.DeadlineExceeded, "authorization evaluation timed out")
		case errors.Is(err, gateway.ErrQueueFull):
			return nil, status.Error(codes.ResourceExhausted, "authorization queue is full")
		case errors.Is(err, gateway.ErrPoolStopped):
			return nil, status.Error(codes.Unavailable, "authorization service is shutting down")
		default:
			return nil, status.Error(codes.Unavailable, "authorization evaluation unavailable")
		}
	}
	enum := authorizationv1.Decision_DECISION_DENY
	if decision.Allowed {
		enum = authorizationv1.Decision_DECISION_ALLOW
	}
	return &authorizationv1.EvaluateAccessResponse{
		RequestId: req.GetRequestId(), Decision: enum, Reason: decision.Reason,
		PolicyId: decision.PolicyID, PolicyRevision: decision.Revision,
		EvaluatedAt: time.Now().UTC().Format(time.RFC3339Nano),
	}, nil
}
