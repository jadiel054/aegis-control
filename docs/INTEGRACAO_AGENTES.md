# Integração de Agentes com Aegis Control

## Visão Geral

O Aegis Control atua como **Mission Control** centralizando a coordenação entre os agentes do fleet:
- **Morpheus** - Orquestrador (planejamento de missões)
- **Plutão** - Worker (execução de tarefas)
- **Zarith** - Síntese (consolidação de resultados)

## Fluxo de Execução REAL

```
┌─────────────────────────────────────────────────────────────────┐
│                        AEGIS CONTROL                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐          │
│  │   Missão    │    │   Dispatch  │    │  mission-   │          │
│  │  Criada    │───▶│   er        │───▶│  executor    │          │
│  └─────────────┘    └─────────────┘    └─────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MORPHEUS (Orquestrador)                         │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ POST /api/agent/execute                                       │  │
│  │ Command: plan_real_mission                                    │  │
│  │ → Gera plano detalhado de execução                            │  │
│  └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      PLUTÃO (Worker)                               │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ POST /api/agent/execute                                       │  │
│  │ Command: execute_real                                          │  │
│  │ → Executa tarefas com write-gate ativo                         │  │
│  └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      ZARITH (Síntese)                               │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ POST /aegis/agent/execute                                     │  │
│  │ Command: synthesize_real                                       │  │
│  │ → Consolida resultados e gera relatório final                 │  │
│  └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    [Missão Concluída]
```

## Configuração dos Agentes

### Variáveis de Ambiente Comuns (todos os agentes)

```env
# Conexão com o Aegis Control
AEGIS_BASE_URL=https://aegis-control.vercel.app
AEGIS_AGENT_NAME=Morpheus  # ou Plutao, Zarith
AEGIS_API_KEY=your-aegis-api-key

# Identificação do agente (opcional, obtido via heartbeat)
AEGIS_AGENT_ID=uuid-do-agente
```

### Morpheus (morpheus-app)

**Deploy**: `https://morpheus-app-5bmx.onrender.com`

```env
# No Morpheus (morpheus-api/.env)
AEGIS_BASE_URL=https://aegis-control.vercel.app
AEGIS_AGENT_NAME=Morpheus
AEGIS_API_KEY=your-aegis-api-key

# URL para callback do Aegis
AEGIS_PUBLIC_URL=https://aegis-control.vercel.app
```

**Endpoint implementado**: `POST /api/agent/execute`

**Comandos suportados**:
- `plan_real_mission` - Gera plano de execução REAL
- `execute_real` - Executa tarefa REAL
- `synthesize_real` - Sintetiza resultados

### Plutão (plutao-os)

**Deploy**: `https://plutao-os.vercel.app`

```env
# No Plutão (apps/web/.env.local)
AEGIS_BASE_URL=https://aegis-control.vercel.app
AEGIS_AGENT_NAME=Plutao
AEGIS_API_KEY=your-aegis-api-key
```

**Endpoint implementado**: `POST /api/agent/execute/route.ts`

**Comandos suportados**:
- `plan_real_mission` - Plano de execução
- `execute_real` - Execução REAL com write-gate
- `synthesize_real` - Síntese de resultados

### Zarith (Zarith-Super-Agente)

**Deploy**: `https://zarith-api-server.onrender.com`

```env
# No Zarith (artifacts/api-server/.env)
AEGIS_BASE_URL=https://aegis-control.vercel.app
AEGIS_AGENT_NAME=Zarith
AEGIS_API_KEY=your-aegis-api-key
```

**Endpoint implementado**: `POST /aegis/agent/execute`

**Comandos suportados**:
- `plan_real_mission` - Plano estratégico
- `execute_real` - Execução de tarefas
- `synthesize_real` - Síntese executiva final

## Configuração no Aegis Control

### Variáveis de Ambiente

```env
# No Aegis Control (.env)
MORPHEUS_API_URL=https://morpheus-app-5bmx.onrender.com
PLUTAO_API_URL=https://plutao-os.vercel.app
ZARITH_API_URL=https://zarith-api-server.onrender.com

# Chave para autenticação entre serviços
AEGIS_API_KEY=your-strong-api-key-minimum-32-characters
```

### Pipeline Padrão

```typescript
// Em src/lib/dispatcher.ts
const DEFAULT_PIPELINE = [
  { role: 'orchestrator', agentHint: 'Morpheus', requires_approval: false, execution_mode: 'real' },
  { role: 'worker', agentHint: 'Plutao', requires_approval: true, execution_mode: 'real' },
  { role: 'llm_agent', agentHint: 'Zarith', requires_approval: false, execution_mode: 'real' },
];
```

## Endpoints de Integração

### Aegis → Agentes (Chamada de Execução)

**Request**:
```bash
POST /api/agent/execute
Headers:
  x-api-key: AEGIS_API_KEY
  Content-Type: application/json

Body:
{
  "task_id": "uuid-da-missao",
  "step_index": 0,
  "input": "descrição da entrada",
  "command": "plan_real_mission",
  "mission_title": "Título da missão",
  "mission_description": "Descrição completa",
  "mission_context": "Contexto adicional"
}
```

**Response**:
```json
{
  "success": true,
  "output": "Resultado da execução...",
  "plan": "Plano gerado..."  // opcional, dependendo do comando
}
```

### Agentes → Aegis (Completar Passo)

**Request**:
```bash
POST /api/missions/step/complete
Headers:
  x-api-key: AEGIS_API_KEY
  Content-Type: application/json

Body:
{
  "taskId": "uuid-da-missao",
  "stepIndex": 0,
  "output": "Resultado da execução",
  "agentName": "Morpheus"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Step completed",
  "result": { ... }
}
```

## SDK do Agente

### Uso Básico

```typescript
import { createAegisAgentFromEnv } from './sdk/aegis-agent-sdk';

const agent = createAegisAgentFromEnv(async (cmd) => {
  console.log('Comando recebido:', cmd.command_type, cmd.payload);
  
  // Processar comando
  if (cmd.command_type === 'execute_step') {
    await executeStep(cmd.payload);
  }
});

agent.start();
```

### Métodos do SDK

```typescript
// Enviar heartbeat (a cada 30 segundos)
await agent.heartbeat('online', { status: 'ready' });

// Buscar comandos pendentes
await agent.pollCommands();

// Buscar steps prontos para execução
await agent.pollReadySteps();

// Completar um passo
await agent.executeStep({
  taskId: 'uuid',
  stepIndex: 0,
  output: 'Resultado...'
});

// Enviar mensagem para outro agente
await agent.sendMessage({
  content: 'Mensagem...',
  type: 'log',
  toAgentName: 'Plutao',
  taskId: 'uuid'
});
```

## Testando a Integração

### Teste 1: Missão em Modo SIMULADO

```bash
# 1. Criar missão
curl -X POST https://aegis-control.vercel.app/api/tasks \
  -H "x-api-key: SUA_CHAVE" \
  -H "Content-Type: application/json" \
  -d '{"title": "Teste SIMULADO", "description": "Testar fluxo", "priority": "medium"}'

# 2. Iniciar missão (via /missions page ou API)
curl -X POST https://aegis-control.vercel.app/api/missions/advance \
  -H "x-api-key: SUA_CHAVE" \
  -H "Content-Type: application/json" \
  -d '{"taskId": "uuid-da-missao"}'

# 3. Aprovar passo (se necessário)
curl -X POST https://aegis-control.vercel.app/api/missions/approve \
  -H "x-api-key: SUA_CHAVE" \
  -H "Content-Type: application/json" \
  -d '{"taskId": "uuid-da-missao", "approvedBy": "operator"}'
```

### Teste 2: Missão em Modo REAL

```bash
# 1. Configurar variáveis de ambiente no Aegis
MORPHEUS_API_URL=https://morpheus-app-5bmx.onrender.com
PLUTAO_API_URL=https://plutao-os.vercel.app
ZARITH_API_URL=https://zarith-api-server.onrender.com

# 2. Criar missão com execução REAL
curl -X POST https://aegis-control.vercel.app/api/tasks \
  -H "x-api-key: SUA_CHAVE" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Teste REAL", 
    "description": "Testar execução REAL", 
    "priority": "high",
    "pipeline": [
      { "role": "orchestrator", "agentHint": "Morpheus", "requires_approval": false, "execution_mode": "real" },
      { "role": "worker", "agentHint": "Plutao", "requires_approval": true, "execution_mode": "real" },
      { "role": "llm_agent", "agentHint": "Zarith", "requires_approval": false, "execution_mode": "real" }
    ]
  }'

# 3. Iniciar missão
curl -X POST https://aegis-control.vercel.app/api/missions/advance \
  -H "x-api-key: SUA_CHAVE" \
  -d '{"taskId": "uuid-da-missao"}'
```

## Solução de Problemas

### Erro: "execução real não implementada"

**Causa**: Variáveis de ambiente não configuradas

**Solução**: 
```env
MORPHEUS_API_URL=https://morpheus-app-5bmx.onrender.com
PLUTAO_API_URL=https://plutao-os.vercel.app
ZARITH_API_URL=https://zarith-api-server.onrender.com
```

### Erro: "Unauthorized: AEGIS_API_KEY mismatch"

**Causa**: Chave API não configurada ou inválida

**Solução**: 
1. Verifique que `AEGIS_API_KEY` está configurado em todos os serviços
2. Verifique que a chave é a mesma em todos os ambientes
3. Adicione o header `x-api-key` em todas as requisições

### Erro: "Agent not found"

**Causa**: Agente não registrado no Aegis

**Solução**: 
```bash
# Registrar agente via heartbeat
curl -X POST https://aegis-control.vercel.app/api/agents/heartbeat \
  -H "x-api-key: SUA_CHAVE" \
  -H "Content-Type: application/json" \
  -d '{"name": "Morpheus", "status": "online"}'
```

### Erro: "Connection refused"

**Causa**: Serviço do agente não está rodando

**Solução**: 
1. Verifique se o serviço está deployado
2. Verifique a URL configurada no Aegis
3. Teste a URL diretamente:
```bash
curl -I https://morpheus-app-5bmx.onrender.com/api/health
```

## Monitoramento

### Dashboard do Aegis
- **URL**: `/missions` - Visualizar todas as missões
- **URL**: `/agents` - Ver status dos agentes
- **URL**: `/messages` - Feed de mensagens em tempo real

### Logs dos Agentes

**Morpheus**:
```bash
# Ver logs do backend
npm run logs --prefix morpheus-api
```

**Plutão**:
```bash
# Ver logs do Next.js
npm run logs --prefix plutao-os
```

**Zarith**:
```bash
# Ver logs do API server
npm run logs --prefix zarith-api-server
```

## Segurança

### Autenticação
- Todas as requisições POST/PATCH requerem `x-api-key` header
- A chave deve ser a mesma configurada no Aegis Control
- Agentes devem validar a chave antes de processar requisições

### CORS
- Configurar CORS permissivo para desenvolvimento
- Em produção, restringir para domínios conhecidos

### Rate Limiting
- Recomendado: 100 requisições/minuto por IP
- Configurar no middleware de cada serviço

## Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                        AEGIS CONTROL                              │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  Mission Control                                            │  │
│  │  - Dispatcher (pipeline)                                     │  │
│  │  - Mission Executor (REAL/SIMULATED)                        │  │
│  │  - Audit System (relatórios Markdown)                       │  │
│  │  - Telegram Integration (webhook)                          │  │
│  └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────────┼───────────────────┐
              ▼                   ▼                   ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│   MORPHEUS      │   │    PLUTÃO        │   │    ZARITH       │
│   Orquestrador  │   │    Worker        │   │   Síntese        │
│                 │   │                 │   │                 │
│  - Planejamento │   │  - Execução      │   │  - Consolidação  │
│  - Coordenação  │   │  - Write-gate    │   │  - Relatórios    │
│  - Multi-LLM    │   │  - Sandbox      │   │  - Análise       │
└─────────────────┘   └─────────────────┘   └─────────────────┘
                              │
                              ▼
                    [Fluxo Completo]
```

## Contribuição

1. Fork o repositório
2. Crie uma branch para sua feature (`git checkout -b feature/nova-integracao`)
3. Commit suas mudanças (`git commit -m 'Adiciona nova integração'`)
4. Push para a branch (`git push origin feature/nova-integracao`)
5. Abra um Pull Request

## Licença

MIT - Veja [LICENSE](LICENSE) para mais detalhes.
