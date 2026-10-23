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
```

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
