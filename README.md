# Aegis Control

Mission control for Jadiel's autonomous agents.

**Backend: Neon Postgres** (Supabase fully removed).

## Stack

- Next.js 14
- Neon (`@neondatabase/serverless`)
- Simple password auth (`AEGIS_ADMIN_PASSWORD`)
- Polling (10s) instead of Realtime

## Environment

```env
DATABASE_URL=postgresql://...@ep-xxx-pooler....neon.tech/neondb?sslmode=require
AEGIS_ADMIN_PASSWORD=sua-senha-forte
```

### API Authentication
All write operations (POST, PATCH) require API key authentication via one of these headers:
- `Authorization: Bearer YOUR_AEGIS_API_KEY`
- `x-api-key: YOUR_AEGIS_API_KEY`

Required environment variable:
```env
AEGIS_API_KEY=your-strong-api-key-minimum-32-characters
```

**Important:** Agents and the dashboard must include the API key in all write requests.

## Agent SDK

See `sdk/aegis-agent-sdk.ts`.

```ts
import { createAegisAgentFromEnv } from './sdk/aegis-agent-sdk';

const agent = createAegisAgentFromEnv(async (cmd) => {
  console.log('command', cmd.command_type, cmd.payload);
});
agent.start();
```

Env for each agent:

```env
AEGIS_BASE_URL=https://your-aegis.vercel.app
AEGIS_AGENT_NAME=Plutao   # or Morpheus, Zarith, VitaBot...
AEGIS_API_KEY=your-agent-api-key   # Required for authenticated requests
```

**Note:** All agents must send the `x-api-key` or `Authorization: Bearer` header in requests to write endpoints.

## Registered agents (seed)

- Jarvis (orchestrator)
- Morpheus (coordinator)
- Zarith (engineer)
- Plutao (worker)
- VitaBot (telegram_bot)
- SecretarIA (saas)
- Afiliados (worker)

## API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/agents/heartbeat` | Heartbeat |
| GET/POST | `/api/agents` | List / register agents |
| GET/POST | `/api/commands` | List / dispatch commands |
| GET/POST | `/api/tasks` | Tasks |
| GET/POST | `/api/messages` | Dispatch messages |
| GET/POST | `/api/incidents` | Security incidents |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Session check |

## Go gRPC authorization gateway (v1 foundation)

The Go service is a separate persistent process; do not run it inside a Next.js/Vercel route. Apply `db/migrations/002_authorization_policies.sql` after the existing migration. The new table starts empty, so unmatched requests deny. V1 supports exact-match rules on tenant, principal, action and resource; there is no policy-management UI yet.

The Go service polls `GET /api/internal/policies/snapshot` over HTTPS using `AEGIS_POLICY_SNAPSHOT_SECRET`. The endpoint uses `AEGIS_GATEWAY_SYNC_SECRET` on the Next.js side. Snapshot freshness defaults to 30 seconds (`AEGIS_POLICY_SNAPSHOT_TTL_SECONDS`) and the Go poll interval defaults to 10 seconds. Expired or missing snapshots deny. Configure a separate `AEGIS_GRPC_API_KEY` on Next.js and Go, plus the Go TLS certificate/key and `AEGIS_GRPC_TARGET` for the Node client. Never reuse the global agent `AEGIS_API_KEY` for either service credential.

`POST /api/admin/authorization/evaluate` is a server-to-server diagnostic route. It requires `AEGIS_AUTHORIZATION_DIAGNOSTIC_KEY` and a configured gRPC target. Never send that key to browser code or agents. It is not an agent authorization endpoint: the current shared agent API key does not prove an individual principal, so production agent traffic must not use this route or gateway yet.

Run the contract checks with `npm run test:contracts` and Go tests with `go test -race ./cmd/... ./gen/... ./internal/... ./pkg/...` (the explicit package roots avoid scanning third-party `node_modules`). To regenerate stubs, install `protoc`, `protoc-gen-go` and `protoc-gen-go-grpc`, then run `make proto`. To start the Go process locally, configure the service-side variables from `.env.example`, including `AEGIS_POLICY_SNAPSHOT_URL`, `AEGIS_POLICY_SNAPSHOT_SECRET`, `AEGIS_GRPC_API_KEY`, `AEGIS_GRPC_TLS_CERT_FILE` and `AEGIS_GRPC_TLS_KEY_FILE`, then run `go run ./cmd/aegis-gateway`. No deployment is performed by this repository change.
