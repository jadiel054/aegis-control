# Dispatcher — missão compartilhada

## Fluxo

```
Entrada (Telegram / API / painel)
  → createMission → task + task_steps
  → passo 0 ready (Morpheus)
  → agent POST /api/missions/:id { action: complete, output }
  → handoff próximo (Plutão, gate)
  → /approve no Telegram se requires_approval
  → Zarith síntese → done + notify
```

## Pipeline padrão

1. Morpheus (orchestrator)
2. Plutão (worker) — **requires_approval**
3. Zarith (llm_agent / síntese)

Não passa em todos os bots Jarvis_* — só nos papéis do plano.

## API

```bash
# criar
curl -X POST .../api/missions -d '{"title":"...","description":"...","source":"api"}'

# agente conclui passo
curl -X POST .../api/missions/TASK_ID -d '{"action":"complete","output":"...","agent_name":"Morpheus"}'

# aprovar / rejeitar
curl -X POST .../api/missions/TASK_ID -d '{"action":"approve","by":"operator"}'
```

## Telegram

- `/mission texto da tarefa`
- `/approve <uuid>`
- `/reject <uuid>`
- `/task <uuid>`
- `/pending`

## Ainda falta (próximo)

Workers reais (Morpheus/Plutão) fazendo poll de `task_steps` status=ready e executando.
Hoje o esqueleto de handoff + aprovação existe; a execução automática do passo é o próximo fio.
