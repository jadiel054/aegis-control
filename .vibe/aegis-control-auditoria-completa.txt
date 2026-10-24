# AEGIS CONTROL - AUDITORIA COMPLETA & ROADMAP DE MELHORIAS

---

## 📊 DIAGNÓSTICO ATUAL DO SISTEMA

---

### ✅ O QUE ESTÁ FUNCIONANDO BEM

| Componente | Status | Notas |
|------------|--------|-------|
| **Arquitetura** | ✅ Excelente | Next.js 14 + Neon + TypeScript, bem estruturado |
| **Dispatcher** | ✅ 90% | Pipeline Morpheus→Plutão→Zarith funcionando |
| **Telegram Integration** | ✅ 85% | Webhook + comandos + notificações |
| **Agent SDK** | ✅ 80% | Fácil integração, mas precisa de melhorias |
| **Audit System** | ✅ 90% | Relatórios Markdown + envio Telegram |
| **UI Dashboard** | ✅ 80% | Design profissional, real-time polling |
| **Segurança (após PR #6)** | ✅ 95% | Todas as rotas protegidas |

---

### ⚠️ GAPS CRÍTICOS IDENTIFICADOS

| # | Problema | Impacto | Complexidade | Prioridade |
|---|----------|---------|--------------|------------|
| 1 | **Execução REAL não implementada** | 🔴 Bloqueia produção | ⭐⭐⭐ | **P0** |
| 2 | **Agentes não pollam task_steps** | 🔴 Fluxo não funciona sozinho | ⭐⭐ | **P0** |
| 3 | **Sem página de missões** | ⚠️ Operador sem visibilidade | ⭐ | **P1** |
| 4 | **Migração com erro (supabase_realtime)** | ⚠️ Quebra no Neon | ⭐ | **P1** |
| 5 | **Sem endpoint GET /api/missions** | ⚠️ Não dá para listar | ⭐ | **P1** |
| 6 | **Jarvis Comando hardcoded** | ⚠️ Não é flexível | ⭐ | **P2** |
| 7 | **Sem rate limiting** | ⚠️ Risco de abuse | ⭐⭐ | **P2** |
| 8 | **Sem testes automatizados** | ⚠️ Risco de regressão | ⭐⭐⭐ | **P2** |
| 9 | **Agentes externos não integrados** | ⚠️ Morpheus/Plutão/Zarith não usam task_steps | ⭐⭐⭐ | **P0** |

---

---

## 🚀 ROADMAP DE MELHORIAS (PRIORIZADO)

---

### 🔴 P0 - CRÍTICO (BLOQUEIA PRODUÇÃO)

---

#### 1. Implementar Execução REAL (2-3 dias)
**Problema:** No mission-executor.ts linha 68: throw new Error('execução real não implementada')

**Solução:**
```typescript
// Em mission-executor.ts, substituir:
if (execMode === 'real') {
  throw new Error('execução real não implementada');
} else {
  // simulação
}

// Por:
if (execMode === 'real') {
  // Implementar execução real
  if (step.role === 'worker' || /plutao|plutão/i.test(agentLabel)) {
    // Chamar endpoint real do Plutão
    const response = await fetch(`${process.env.PLUTAO_API_URL}/api/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.AEGIS_API_KEY
      },
      body: JSON.stringify({
        task_id: taskId,
        step_index: idx,
        input: input,
        command: 'execute_real'
      })
    });
    if (!response.ok) throw new Error(`Plutão retornou erro: ${response.status}`);
    output = await response.json();
  } else {
    // Outros agentes...
  }
} else {
  // simulação (existente)
}
```

**Dependências:**
- Variáveis de ambiente: PLUTAO_API_URL, MORPHEUS_API_URL, ZARITH_API_URL
- Endpoints nos agentes externos

---

#### 2. Agentes Pollando task_steps (2-3 dias)
**Problema:** Os agentes (Morpheus, Plutão, Zarith) não buscam steps prontos para executar

**Solução - Adicionar ao SDK:**
```typescript
// Em sdk/aegis-agent-sdk.ts
async pollTaskSteps(): Promise<TaskStep[]> {
  if (!this.agentId) {
    await this.heartbeat('online');
  }
  const url = `${this.cfg.baseUrl}/api/task_steps?agent_id=${this.agentId}&status=ready`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return data.steps || [];
}

async executeTaskStep(step: TaskStep): Promise<void> {
  // Executar o step e enviar resultado
  const result = await this.executeStepLogic(step);
  await fetch(`${this.cfg.baseUrl}/api/missions/${step.task_id}/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.AEGIS_API_KEY || ''
    },
    body: JSON.stringify({
      step_index: step.step_index,
      output: result,
      agent_name: this.cfg.agentName
    })
  });
}
```

**Solução - Endpoint para listar steps:**
```typescript
// src/app/api/task_steps/route.ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get('agent_id');
  const status = searchParams.get('status') || 'ready';

  const sql = getSql();
  const steps = await sql`
    SELECT ts.*, t.title as task_title
    FROM task_steps ts
    JOIN tasks t ON t.id = ts.task_id
    WHERE ts.agent_id = ${agentId}
    AND ts.status = ${status}
    ORDER BY ts.created_at
    LIMIT 10
  `;
  return NextResponse.json({ steps });
}
```

---

---

### 🟡 P1 - ALTO IMPACTO (2-3 dias)

---

#### 3. Página de Missões (1-2 dias)
**Problema:** Não tem como ver todas as missões e seu progresso

**Solução - Nova página src/app/missions/page.tsx:**
```tsx
'use client';
import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { ListTodo, RefreshCw, Eye } from 'lucide-react';
import Link from 'next/link';

export default function MissionsPage() {
  const [missions, setMissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const res = await fetch('/api/missions');
    const data = await res.json();
    setMissions(data.missions || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold tracking-widest uppercase flex items-center gap-2">
          <ListTodo className="h-5 w-5 text-cyan-400" /> Missões
        </h1>
        <button onClick={load} className="px-3 py-2 border border-[#1E293B] text-xs uppercase tracking-widest rounded">
          <RefreshCw className="h-3.5 w-3.5 inline mr-2" /> Refresh
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-cyan-400">Carregando...</p>
      ) : missions.length === 0 ? (
        <p className="text-xs text-slate-500">Nenhuma missão ainda.</p>
      ) : (
        <div className="space-y-3">
          {missions.map((m) => (
            <div key={m.id} className="border border-[#1E293B] bg-[#080D17]/80 rounded p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="text-sm font-semibold text-slate-200">{m.title}</p>
                  <p className="text-[10px] text-slate-500 uppercase mt-1">
                    {m.status} · {m.priority} · Criado: {new Date(m.created_at).toLocaleString()}
                  </p>
                </div>
                <Link
                  href={`/missions/${m.id}`}
                  className="text-xs text-cyan-400 hover:underline flex items-center gap-1"
                >
                  <Eye className="h-3 w-3" /> Ver
                </Link>
              </div>
              <div className="text-xs text-slate-400">
                {m.steps?.map((s: any) => (
                  <span key={s.id} className="mr-2">
                    {s.step_index}. {s.agent_name || s.role} [{s.status}]
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
```

**Solução - Endpoint GET /api/missions:**
```typescript
// src/app/api/missions/route.ts
export async function GET(request: Request) {
  try {
    if (!checkApiKey(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const sql = getSql();
    const missions = await sql`
      SELECT t.*, 
             json_agg(json_build_object(
               'id', ts.id,
               'step_index', ts.step_index,
               'agent_name', ts.agent_name,
               'role', ts.role,
               'status', ts.status,
               'requires_approval', ts.requires_approval,
               'execution_mode', ts.execution_mode
             )) as steps
      FROM tasks t
      LEFT JOIN task_steps ts ON ts.task_id = t.id
      GROUP BY t.id
      ORDER BY t.created_at DESC
      LIMIT 100
    `;
    return NextResponse.json({ missions });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

---

#### 4. Corrigir Migração (0.5 dia)
**Problema:** A migração tenta alterar supabase_realtime que não existe no Neon

**Solução - Remover do db/migrations/001_mission_gates.sql:**
```sql
-- REMOVER ESTE BLOCO (linhas 120-145):
BEGIN;
  -- Remove tables if they are already in the publication to avoid errors
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.agents;
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.tasks;
  -- ... (todas as linhas ALTER PUBLICATION)
COMMIT;
```

**Solução - Criar nova migração idempotente:**
```sql
-- db/migrations/002_fix_missions.sql
-- Add missing columns if not exist
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS current_step INTEGER DEFAULT 0;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON public.tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_task_steps_task_id ON public.task_steps(task_id);
CREATE INDEX IF NOT EXISTS idx_task_steps_status ON public.task_steps(status);
```

---

#### 5. Página de Detalhes da Missão (1 dia)
**Solução - Nova página src/app/missions/[id]/page.tsx:**
```tsx
'use client';
import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import Link from 'next/link';

export default function MissionDetailPage({ params }: { params: { id: string } }) {
  const [mission, setMission] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const res = await fetch(`/api/missions/${params.id}`);
    const data = await res.json();
    setMission(data.mission);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [params.id]);

  if (loading) return <DashboardLayout><p className="text-xs text-cyan-400">Carregando...</p></DashboardLayout>;
  if (!mission) return <DashboardLayout><p className="text-xs text-slate-500">Missão não encontrada</p></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="mb-4">
        <Link href="/missions" className="text-xs text-cyan-400 hover:underline flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Voltar
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold tracking-widest uppercase">{mission.task.title}</h1>
        <button onClick={load} className="px-3 py-2 border border-[#1E293B] text-xs uppercase tracking-widest rounded">
          <RefreshCw className="h-3.5 w-3.5 inline mr-2" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="border border-[#1E293B] bg-[#080D17]/80 p-4 rounded">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Status</p>
          <p className="text-lg font-bold text-cyan-400">{mission.task.status}</p>
        </div>
        <div className="border border-[#1E293B] bg-[#080D17]/80 p-4 rounded">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Prioridade</p>
          <p className="text-lg font-bold text-amber-400">{mission.task.priority}</p>
        </div>
        <div className="border border-[#1E293B] bg-[#080D17]/80 p-4 rounded">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Agente Atual</p>
          <p className="text-lg font-bold">{mission.task.assigned_agent_name || 'Nenhum'}</p>
        </div>
      </div>

      <div className="mb-6">
        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-4">Pipeline</h2>
        <div className="space-y-3">
          {mission.steps.map((s: any) => (
            <div key={s.id} className={`border rounded p-4 ${s.status === 'done' ? 'border-emerald-900/50 bg-emerald-950/10' : s.status === 'awaiting_approval' ? 'border-amber-900/50 bg-amber-950/10' : s.status === 'failed' || s.status === 'rejected' ? 'border-red-900/50 bg-red-950/10' : 'border-[#1E293B] bg-[#080D17]/80'}`}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-semibold text-slate-200">
                    Passo {s.step_index}: {s.agent_name || s.role}
                  </p>
                  <p className="text-[10px] text-slate-500 uppercase mt-1">
                    Modo: {s.execution_mode} · Requires Approval: {s.requires_approval ? 'Sim' : 'Não'}
                  </p>
                </div>
                <span className={`text-xs font-bold px-2 py-1 rounded ${s.status === 'done' ? 'bg-emerald-900/20 text-emerald-400' : s.status === 'awaiting_approval' ? 'bg-amber-900/20 text-amber-400' : s.status === 'failed' || s.status === 'rejected' ? 'bg-red-900/20 text-red-400' : 'bg-slate-800 text-slate-400'}`}>
                  {s.status}
                </span>
              </div>
              {s.input && <p className="text-xs text-slate-500 mt-2">Entrada: {s.input.slice(0, 200)}</p>}
              {s.output && <p className="text-xs text-slate-300 mt-2">Saída: {s.output.slice(0, 500)}</p>}
              {s.approved_by && <p className="text-xs text-cyan-400 mt-1">Aprovado por: {s.approved_by} em {s.approved_at}</p>}
            </div>
          ))}
        </div>
      </div>

      <div className="border border-[#1E293B] bg-[#080D17]/80 p-4 rounded">
        <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-2">Ações</h3>
        <div className="flex gap-2">
          {mission.task.status === 'in_progress' && (
            <>
              <button className="px-3 py-2 bg-cyan-900/40 border border-cyan-500/40 text-cyan-300 text-xs uppercase font-bold tracking-widest rounded">
                Ver Logs
              </button>
              {mission.steps.some((s: any) => s.status === 'awaiting_approval') && (
                <button className="px-3 py-2 bg-amber-900/40 border border-amber-500/40 text-amber-300 text-xs uppercase font-bold tracking-widest rounded">
                  Aprovar Passo
                </button>
              )}
            </>
          )}
          {mission.task.status !== 'done' && mission.task.status !== 'rejected' && mission.task.status !== 'failed' && (
            <button className="px-3 py-2 bg-red-900/40 border border-red-500/40 text-red-300 text-xs uppercase font-bold tracking-widest rounded">
              Rejeitar Missão
            </button>
          )}
          <button className="px-3 py-2 bg-slate-800 border border-slate-700 text-slate-300 text-xs uppercase font-bold tracking-widest rounded">
            Download Auditoria
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
}
```

---

---

### 🟢 P2 - MÉDIO IMPACTO (3-5 dias)

---

#### 6. Tornar Jarvis Comando Configurável (1 dia)
**Problema:** O código sempre procura por Jarvis Comando hardcoded

**Solução:**
```typescript
// Em src/lib/fleet-notify.ts e src/app/api/telegram/webhook/route.ts
// Substituir:
const agentName = searchParams.get('agent') || 'Jarvis Comando';

// Por:
const agentName = searchParams.get('agent') || process.env.DEFAULT_TELEGRAM_BOT_NAME || 'Jarvis Comando';
```

**Variável de ambiente:**
```env
DEFAULT_TELEGRAM_BOT_NAME=Jarvis Comando
```

---

#### 7. Adicionar Rate Limiting (1-2 dias)
**Solução - Usar rate-limiter-flexible:**

```typescript
// src/lib/rate-limit.ts
import { RateLimiterMemory } from 'rate-limiter-flexible';

const rateLimiter = new RateLimiterMemory({
  points: 10, // 10 requests
  duration: 1, // per 1 second
});

const rateLimiterSlow = new RateLimiterMemory({
  points: 100, // 100 requests
  duration: 60, // per 60 seconds
});

export async function checkRateLimit(ip: string, endpoint: string) {
  try {
    const limiter = endpoint.includes('/api/') ? rateLimiter : rateLimiterSlow;
    await limiter.consume(ip);
    return true;
  } catch {
    return false;
  }
}
```

**Uso nas rotas:**
```typescript
// Em cada route.ts
import { checkRateLimit } from '@/lib/rate-limit';

export async function POST(request: Request) {
  const ip = request.ip || request.headers.get('x-forwarded-for') || 'unknown';
  if (!await checkRateLimit(ip, '/api/agents')) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  // ... resto do código
}
```

---

#### 8. Testes Automatizados (2-3 dias)
**Solução - Criar testes com Jest:**

```typescript
// tests/api/agents.test.ts
import { POST } from '@/app/api/agents/route';
import { NextRequest } from 'next/server';

describe('POST /api/agents', () => {
  it('should return 401 without API key', async () => {
    const request = new NextRequest('http://localhost/api/agents', {
      method: 'POST',
      body: JSON.stringify({ name: 'TestAgent' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('should create agent with valid API key', async () => {
    process.env.AEGIS_API_KEY = 'test-key';
    const request = new NextRequest('http://localhost/api/agents', {
      method: 'POST',
      headers: { 'x-api-key': 'test-key' },
      body: JSON.stringify({ name: 'TestAgent' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
  });
});
```

**Configuração:**
```bash
npm install --save-dev jest @types/jest ts-jest @testing-library/react @testing-library/jest-dom
```

---

#### 9. Integração com Agentes Externos (3-5 dias)
**Problema:** Morpheus, Plutão, Zarith não usam o task_steps do Aegis

**Solução - Para cada agente:**

**a) Morpheus (Orchestrator):**
```typescript
// No Morpheus, adicionar:
async function pollAndExecuteSteps() {
  const response = await fetch(`${process.env.AEGIS_BASE_URL}/api/task_steps?agent_id=${agentId}&status=ready`);
  const { steps } = await response.json();

  for (const step of steps) {
    if (step.role === 'orchestrator' || step.agent_name === 'Morpheus') {
      const result = await executeOrchestration(step.input);
      await fetch(`${process.env.AEGIS_BASE_URL}/api/missions/${step.task_id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.AEGIS_API_KEY
        },
        body: JSON.stringify({
          action: 'complete',
          step_index: step.step_index,
          output: result,
          agent_name: 'Morpheus'
        })
      });
    }
  }
}
```

**b) Plutão (Worker - Execução REAL):**
```typescript
// No Plutão, adicionar:
async function pollAndExecuteSteps() {
  const response = await fetch(`${process.env.AEGIS_BASE_URL}/api/task_steps?agent_id=${agentId}&status=ready`);
  const { steps } = await response.json();

  for (const step of steps) {
    if (step.role === 'worker' || step.agent_name === 'Plutão') {
      if (step.execution_mode === 'real') {
        const result = await executeRealTask(step.input);
        await completeStep(step.task_id, step.step_index, result);
      } else {
        const result = await simulateExecution(step.input);
        await completeStep(step.task_id, step.step_index, result);
      }
    }
  }
}

async function completeStep(taskId: string, stepIndex: number, output: string) {
  await fetch(`${process.env.AEGIS_BASE_URL}/api/missions/${taskId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.AEGIS_API_KEY
    },
    body: JSON.stringify({
      action: 'complete',
      step_index: stepIndex,
      output: output,
      agent_name: 'Plutão'
    })
  });
}
```

**c) Zarith (Engineer/Synthesis):**
```typescript
// No Zarith, adicionar:
async function pollAndExecuteSteps() {
  const response = await fetch(`${process.env.AEGIS_BASE_URL}/api/task_steps?agent_id=${agentId}&status=ready`);
  const { steps } = await response.json();

  for (const step of steps) {
    if (step.role === 'llm_agent' || step.agent_name === 'Zarith') {
      const result = await generateSynthesis(step.input);
      await completeStep(step.task_id, step.step_index, result);
    }
  }
}
```

---

---

## 🎯 INTEGRAÇÃO COM OUTROS REPOSITÓRIOS

**Jadiel, para implementar a execução REAL e o polling de steps, preciso que você me dê acesso ou me mostre os repositórios:**

1. **Morpheus** - Orchestrator
2. **Plutão** - Worker (execução REAL)
3. **Zarith** - Engineer/Synthesis
4. **Jarvis** - Principal

**O que eu posso fazer com acesso:**

| Repositório | O que implementar | Impacto |
|-------------|-------------------|---------|
| **Morpheus** | Polling de task_steps + execução de passos de orchestration | ✅ Fluxo automático |
| **Plutão** | Polling de task_steps + execução REAL (write-gate) | ✅ Execução real |
| **Zarith** | Polling de task_steps + síntese final | ✅ Síntese automática |
| **Jarvis** | Integração com Aegis para status e comandos | ✅ Visão unificada |

---

---

## 📈 ROADMAP COMPLETO (3-4 SEMANAS)

### Semana 1: Fundamentos (P0)
- ✅ **Segurança (PR #6)** - **FEITO**
- [ ] Corrigir migração (0.5 dia)
- [ ] Endpoint GET /api/missions (0.5 dia)
- [ ] Página de missões (1 dia)
- [ ] Página de detalhes da missão (1 dia)

### Semana 2: Execução (P0)
- [ ] Implementar execução REAL no mission-executor.ts (2 dias)
- [ ] Endpoint para agents polarem task_steps (1 dia)
- [ ] Atualizar SDK para suportar polling (1 dia)

### Semana 3: Integração com Agentes (P0)
- [ ] Integrar Morpheus com task_steps (2 dias)
- [ ] Integrar Plutão com execução REAL (2 dias)
- [ ] Integrar Zarith com síntese (1 dia)

### Semana 4: Qualidade (P2)
- [ ] Adicionar rate limiting (1 dia)
- [ ] Adicionar testes automatizados (2 dias)
- [ ] Tornar Jarvis Comando configurável (0.5 dia)
- [ ] Documentação completa (1 dia)

---

---

## 💡 SUGESTÕES ESTRATÉGICAS

### 1. Arquitetura de Microserviços
**Problema:** Tudo no Aegis pode ficar pesado

**Solução:**
```
Aegis Control (Mission Control)
    │
    ├── Morpheus Service (Orchestration)
    ├── Plutão Service (Execution)
    ├── Zarith Service (Synthesis)
    ├── Jarvis Service (Chat/Telegram)
    └── Neon Database (Shared)
```

**Benefícios:**
- Cada serviço pode ser escalado independentemente
- Falha em um não afeta os outros
- Mais fácil de manter e deployar

---

### 2. Message Queue (RabbitMQ/Redis)
**Problema:** Polling é ineficiente

**Solução:**
```typescript
// Em vez de polling:
setInterval(async () => {
  const steps = await fetchTaskSteps();
  // ...
}, 10000);

// Usar WebSockets ou Message Queue:
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(DATABASE_URL, { realtime: { ... } });

supabase.channel('task_steps')
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'task_steps' }, (payload) => {
    if (payload.new.status === 'ready' && payload.new.agent_id === agentId) {
      executeStep(payload.new);
    }
  })
  .subscribe();
```

**Benefícios:**
- Tempo real (não precisa esperar polling)
- Mais eficiente (não faz requests desnecessários)
- Menor carga no banco

---

### 3. Write-Gate System
**Problema:** Execução REAL pode ser perigosa

**Solução:**
```typescript
// Em mission-executor.ts
async function executeRealStep(step: TaskStep, input: string) {
  // 1. Validar que o agente tem permissão para write
  if (!agentHasWritePermission(step.agent_name)) {
    throw new Error('Agente não tem permissão para execução REAL');
  }

  // 2. Validar que o operador aprovou explicitamente
  if (!step.write_approved) {
    throw new Error('Execução REAL requer aprovação explícita do operador');
  }

  // 3. Logar a ação para auditoria
  await logWriteAction({
    agent: step.agent_name,
    task_id: step.task_id,
    step_index: step.step_index,
    action: 'write',
    input: input,
    approved_by: step.approved_by
  });

  // 4. Executar com timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

  try {
    const result = await executeWithTimeout(input, controller.signal);
    clearTimeout(timeout);
    return result;
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}
```

---

### 4. Monitoring & Observability
**Solução:**
```typescript
// Adicionar em todas as rotas:
import { trackEvent } from '@/lib/analytics';

export async function POST(request: Request) {
  const start = Date.now();
  try {
    const result = await handler(request);
    await trackEvent({
      endpoint: '/api/missions',
      method: 'POST',
      status: 'success',
      duration: Date.now() - start,
      timestamp: new Date().toISOString()
    });
    return result;
  } catch (error) {
    await trackEvent({
      endpoint: '/api/missions',
      method: 'POST',
      status: 'error',
      error: error.message,
      duration: Date.now() - start,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}
```

**Dashboard de Monitoring:**
- Requests por minuto
- Tempo médio de resposta
- Erros por endpoint
- Status dos agentes

---

### 5. CI/CD Pipeline
**Solução:**
```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run lint
      - run: npm test

  deploy-preview:
    needs: test
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build
      - uses: vercel/action@v2
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-args: '--preview'
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}

  deploy-production:
    needs: test
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build
      - uses: vercel/action@v2
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-args: '--prod'
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
```

---

---

## 🎯 MINHA RECOMENDAÇÃO FINAL

**Jadiel, focar nestes 5 itens primeiro (1-2 semanas):**

| # | Item | Tempo | Impacto |
|---|------|-------|---------|
| 1 | **Merge PR #6** | 0 dias | ✅ Segurança completa |
| 2 | **Corrigir migração + GET /api/missions** | 1 dia | ✅ Base para UI |
| 3 | **Página de missões + detalhes** | 2 dias | ✅ Visibilidade do operador |
| 4 | **Endpoint para agents polarem task_steps** | 1 dia | ✅ Fluxo automático |
| 5 | **Implementar execução REAL** | 2 dias | ✅ Produção ready |

**Depois (2-3 semanas):**
| # | Item | Tempo | Impacto |
|---|------|-------|---------|
| 6 | **Integrar Morpheus com task_steps** | 2 dias | ✅ Orchestration automática |
| 7 | **Integrar Plutão com execução REAL** | 2 dias | ✅ Write-gate funcional |
| 8 | **Adicionar rate limiting** | 1 dia | ✅ Segurança contra abuse |
| 9 | **Adicionar testes automatizados** | 2 dias | ✅ Qualidade do código |
| 10 | **Documentação completa** | 1 dia | ✅ Onboarding fácil |

---

---

## 🚀 O QUE EU POSSO FAZER AGORA

**Com acesso aos repositórios (Morpheus, Plutão, Zarith, Jarvis):**

1. **Analisar o código atual** de cada agente
2. **Implementar o polling de task_steps** em cada um
3. **Criar os endpoints de execução REAL** no Plutão
4. **Integrar o write-gate** com aprovação
5. **Testar o fluxo completo** de ponta a ponta

**Sem acesso (o que posso fazer agora):**

1. ✅ **PR #6 está pronto** - você pode mergear
2. **Corrigir a migração** - posso fazer agora
3. **Criar páginas de missões** - posso fazer agora
4. **Adicionar endpoints** - posso fazer agora
5. **Documentação** - posso fazer agora

---

---

## 📌 RESUMO EXECUTIVO

| Situação Atual | Status |
|----------------|--------|
| **Segurança** | ✅ **95% completo** (PR #6 pronto) |
| **Fluxo de missão (simulado)** | ✅ **80% completo** |
| **Fluxo de missão (REAL)** | ❌ **0% completo** |
| **Integração com agentes** | ❌ **0% completo** |
| **UI do operador** | ⚠️ **50% completo** |
| **Documentação** | ⚠️ **60% completo** |

**Tempo estimado para 100%: 3-4 semanas de trabalho focado**

---

---

## 💬 CONCLUSÃO

Jadiel, o Aegis Control tem uma **base EXCELENTE** com arquitetura bem pensada.

**O que falta para produção:**
1. **Segurança** - ✅ PR #6 resolve 95%
2. **Execução REAL** - ❌ Precisa de integração com agentes
3. **Fluxo automático** - ❌ Agentes precisam polar task_steps
4. **UI completa** - ⚠️ Precisa de páginas de missões

**Próximos passos recomendados:**
1. **Merge PR #6** (segurança)
2. **Me dê acesso aos repositórios** dos agentes
3. **Começamos pela execução REAL** e polling

**Estou pronto para começar quando você der o sinal!** 💪
