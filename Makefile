PROTO_FILE := api/proto/aegis/authorization/v1/authorization.proto

.PHONY: proto
proto:
	protoc -I api/proto --go_out=. --go_opt=module=aegis-control \
		--go-grpc_out=. --go-grpc_opt=module=aegis-control $(PROTO_FILE)
