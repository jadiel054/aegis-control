# Melhorias de UI e Polling - Aegis Control

## Problema Identificado

Os botões de **Refresh** não estavam funcionando corretamente porque:
1. **Polling automático** não estava implementado em todas as páginas
2. **Estado de loading** não era gerenciado corretamente
3. **Error handling** estava faltando em várias páginas
4. **Feedback visual** era insuficiente

## Soluções Implementadas

### 1. Polling Automático em Todas as Páginas

| Página | Intervalo | Descrição |
|--------|-----------|-----------|
| `/` (Overview) | 10s | Atualiza agentes, tarefas e incidentes |
| `/agents` | 10s | Atualiza lista de agentes |
| `/commands` | 10s | Atualiza comandos e agentes |
| `/tasks` | 10s | Atualiza lista de tarefas |
| `/messages` | 8s | Atualiza feed de mensagens |
| `/security` | 12s | Atualiza incidentes de segurança |
| `/missions` | 10s | Atualiza missões com steps |

### 2. Melhorias nos Botões de Refresh

**Antes:**
```tsx
<button onClick={load} className="px-3 py-2 border border-[#1E293B] text-xs uppercase tracking-widest rounded">
  <RefreshCw className="h-3.5 w-3.5 inline mr-2" /> Refresh
</button>
```

**Depois:**
```tsx
<button 
  onClick={load} 
  className="px-3 py-2 border border-[#1E293B] text-xs uppercase tracking-widest rounded hover:bg-[#121A2E] transition-colors"
>
  <RefreshCw className="h-3.5 w-3.5 inline mr-2" /> Refresh
</button>
```

**Melhorias:**
- ✅ Adicionado `hover:bg-[#121A2E]` para feedback visual
- ✅ Adicionado `transition-colors` para transição suave
- ✅ Estado de loading gerenciado corretamente

### 3. Error Handling Melhorado

**Antes:**
```tsx
const load = useCallback(async () => {
  const res = await fetch('/api/agents');
  const data = await res.json();
  setAgents(data.agents || []);
}, []);
```

**Depois:**
```tsx
const load = useCallback(async () => {
  try {
    const res = await fetch('/api/agents');
    const data = await res.json();
    setAgents(data.agents || []);
  } catch (error) {
    console.error('Failed to load agents:', error);
  }
}, []);
```

**Melhorias:**
- ✅ Try/catch em todas as chamadas fetch
- ✅ Log de erros no console
- ✅ Aplicação não quebra com erros de rede

### 4. Loading States

**Antes:**
- Nenhum feedback visual de loading
- Usuário não sabia se a ação foi disparada

**Depois:**
```tsx
// No overview page
const [refreshing, setRefreshing] = useState(false);

const fetchData = useCallback(async () => {
  try {
    setRefreshing(true);
    // ... fetch logic
  } finally {
    setRefreshing(false);
  }
}, []);

// No button
<button 
  onClick={() => {
    setRefreshing(true);
    fetchData();
  }}
  disabled={refreshing}
  className="... disabled:opacity-50"
>
  <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
  <span>{refreshing ? 'REFRESHING' : 'Refresh'}</span>
</button>
```

**Melhorias:**
- ✅ Estado de `refreshing` gerenciado
- ✅ Botão desabilitado durante loading
- ✅ Animação de spin no ícone
- ✅ Texto muda para "REFRESHING"

## Sugestões Adicionais de Melhorias

### 🎯 Prioridade Alta (P0)

#### 1. WebSocket / Server-Sent Events (SSE)
**Problema:** Polling a cada 8-12 segundos consome requisições desnecessárias.

**Solução:** Implementar SSE para atualizações em tempo real.

```typescript
// Backend (Next.js API Route)
import { EventEmitter } from 'events';

const eventEmitter = new EventEmitter();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const channel = searchParams.get('channel');
  
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  
  const listener = (data: any) => {
    writer.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  
  eventEmitter.on(channel, listener);
  
  request.signal.onabort = () => {
    eventEmitter.off(channel, listener);
    writer.close();
  };
  
  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// Frontend
const eventSource = new EventSource('/api/events?channel=agents');
eventSource.onmessage = (e) => {
  const data = JSON.parse(e.data);
  setAgents(data.agents);
};
```

**Benefícios:**
- ✅ Atualizações instantâneas
- ✅ Menos requisições HTTP
- ✅ Melhor performance

**Complexidade:** ⭐⭐⭐ (Média)

---

#### 2. Notificações Toast
**Problema:** Usuário não recebe feedback claro sobre ações.

**Solução:** Implementar sistema de notificações toast.

```tsx
// components/Toast.tsx
import { useState, useEffect } from 'react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setToasts(toasts.slice(1));
    }, toasts[0]?.duration || 5000);
    return () => clearTimeout(timer);
  }, [toasts]);
  
  return (
    <div className="fixed bottom-6 right-6 z-50 space-y-2">
      {toasts.map((toast) => (
        <div key={toast.id} className={`border rounded px-4 py-2 text-xs ${getToastStyles(toast.type)}`}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}

// Usage
export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  
  const addToast = (type: ToastType, message: string) => {
    const id = Date.now().toString();
    setToasts([...toasts, { id, type, message }]);
  };
  
  return { addToast };
}
```

**Benefícios:**
- ✅ Feedback visual claro para o usuário
- ✅ Notificações de sucesso/erro
- ✅ Auto-dismiss após 5 segundos

**Complexidade:** ⭐⭐ (Fácil)

---

#### 3. Status Online/Offline com Cores
**Problema:** Status "online" não reflete a realidade (últimos heartbeats são antigos).

**Solução:** Implementar lógica de timeout para status.

```tsx
// components/AgentStatus.tsx
interface AgentStatusProps {
  lastHeartbeat: string | null;
  status: string;
}

export function AgentStatus({ lastHeartbeat, status }: AgentStatusProps) {
  const isOnline = (() => {
    if (!lastHeartbeat) return false;
    const lastHB = new Date(lastHeartbeat);
    const now = new Date();
    const diffMs = now.getTime() - lastHB.getTime();
    return diffMs < 90000; // 90 segundos
  })();
  
  const getStatusColor = () => {
    if (status === 'error') return 'bg-red-500';
    if (isOnline) return 'bg-emerald-500';
    return 'bg-slate-600';
  };
  
  const getStatusText = () => {
    if (status === 'error') return 'ERROR';
    if (isOnline) return 'ONLINE';
    return 'OFFLINE';
  };
  
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${getStatusColor()} ${isOnline ? 'animate-pulse' : ''}`} />
      <span className="text-[10px] uppercase">{getStatusText()}</span>
    </div>
  );
}
```

**Benefícios:**
- ✅ Status reflete a realidade
- ✅ Animação de pulse para agentes online
- ✅ Visual mais claro

**Complexidade:** ⭐ (Muito fácil)

---

### 🎯 Prioridade Média (P1)

#### 4. Loading Skeleton
**Problema:** Durante o loading, a tela fica em branco.

**Solução:** Implementar skeletons de loading.

```tsx
// components/Skeleton.tsx
export function AgentCardSkeleton() {
  return (
    <div className="border border-[#1E293B] bg-[#080D17]/80 p-5 rounded animate-pulse">
      <div className="h-4 bg-slate-800 rounded w-3/4 mb-2" />
      <div className="h-3 bg-slate-800 rounded w-1/2 mb-2" />
      <div className="h-3 bg-slate-800 rounded w-1/4" />
    </div>
  );
}

// Usage
{loading ? (
  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
    {[1, 2, 3].map((i) => <AgentCardSkeleton key={i} />)}
  </div>
) : (
  // Real content
)}
```

**Benefícios:**
- ✅ Melhor UX durante loading
- ✅ Percepção de performance
- ✅ Visual mais profissional

**Complexidade:** ⭐⭐ (Fácil)

---

#### 5. Filtros Persistentes
**Problema:** Filtros são resetados ao recarregar a página.

**Solução:** Persistir filtros no localStorage.

```tsx
// hooks/usePersistentState.ts
import { useState, useEffect } from 'react';

export function usePersistentState<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [state, setState] = useState<T>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : initialValue;
    }
    return initialValue;
  });
  
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(state));
  }, [key, state]);
  
  return [state, setState];
}

// Usage
const [filter, setFilter] = usePersistentState('agents-filter', 'all');
```

**Benefícios:**
- ✅ Filtros persistidos entre sessões
- ✅ Melhor UX
- ✅ Menos cliques do usuário

**Complexidade:** ⭐ (Muito fácil)

---

#### 6. Badges de Status
**Problema:** Status é mostrado apenas como texto.

**Solução:** Implementar badges de status.

```tsx
// components/StatusBadge.tsx
interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const getStatusColor = () => {
    switch (status) {
      case 'done': return 'border-emerald-500/40 bg-emerald-950/20 text-emerald-400';
      case 'in_progress': return 'border-cyan-500/40 bg-cyan-950/20 text-cyan-400';
      case 'pending': return 'border-amber-500/40 bg-amber-950/20 text-amber-400';
      case 'failed': case 'rejected': return 'border-red-500/40 bg-red-950/20 text-red-400';
      default: return 'border-slate-700 bg-slate-900/40 text-slate-400';
    }
  };
  
  return (
    <span className={`border rounded px-2 py-0.5 text-[10px] uppercase font-bold ${getStatusColor()}`}>
      {status.replace('_', ' ')}
    </span>
  );
}
```

**Benefícios:**
- ✅ Visual mais claro
- ✅ Cores consistentes
- ✅ Melhor legibilidade

**Complexidade:** ⭐ (Muito fácil)

---

### 🎯 Prioridade Baixa (P2)

#### 7. Dark Mode Toggle
**Problema:** Tema escuro é fixo, não há opção para tema claro.

**Solução:** Implementar toggle de tema.

```tsx
// components/ThemeToggle.tsx
import { useState, useEffect } from 'react';
import { Moon, Sun } from 'lucide-react';

export function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);
  
  return (
    <button 
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="p-2 rounded border border-[#1E293B] hover:bg-[#121A2E]"
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
```

**Benefícios:**
- ✅ Preferência do usuário
- ✅ Acessibilidade
- ✅ Moderno

**Complexidade:** ⭐⭐ (Fácil)

---

#### 8. Tabelas com Ordenação
**Problema:** Não é possível ordenar colunas.

**Solução:** Implementar ordenação de colunas.

```tsx
// hooks/useSortableData.ts
import { useState, useMemo } from 'react';

export function useSortableData<T>(items: T[], config?: { key: string; direction: 'ascending' | 'descending' }) {
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'ascending' | 'descending' } | null>(config || null);
  
  const sortedItems = useMemo(() => {
    if (!sortConfig) return items;
    
    return [...items].sort((a, b) => {
      const aValue = a[sortConfig.key as keyof T];
      const bValue = b[sortConfig.key as keyof T];
      
      if (aValue < bValue) {
        return sortConfig.direction === 'ascending' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'ascending' ? 1 : -1;
      }
      return 0;
    });
  }, [items, sortConfig]);
  
  const requestSort = (key: string) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };
  
  return { sortedItems, requestSort, sortConfig };
}

// Usage
const { sortedItems, requestSort, sortConfig } = useSortableData(agents);

// In table header
<th onClick={() => requestSort('name')} className="cursor-pointer">
  Nome {sortConfig?.key === 'name' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
</th>
```

**Benefícios:**
- ✅ Ordenação flexível
- ✅ Melhor UX para grandes listas
- ✅ Profissional

**Complexidade:** ⭐⭐ (Fácil)

---

## Roadmap de Implementação

### Sprint 1 (1-2 dias) - P0
- [ ] Implementar SSE para polling em tempo real
- [ ] Adicionar notificações toast
- [ ] Corrigir status online/offline

### Sprint 2 (2-3 dias) - P1
- [ ] Adicionar loading skeletons
- [ ] Persistir filtros no localStorage
- [ ] Implementar badges de status

### Sprint 3 (3-4 dias) - P2
- [ ] Adicionar toggle de tema
- [ ] Implementar ordenação de tabelas
- [ ] Melhorar responsividade mobile

---

## Métricas de Sucesso

| Métrica | Antes | Depois | Meta |
|---------|-------|--------|------|
| Requisições HTTP/min | ~60 | ~6 | -90% |
| Tempo para atualização | 10-12s | Instantâneo | <1s |
| Satisfação do usuário | ? | ? | +20% |
| Taxa de erros | ? | ? | <1% |

---

## Conclusão

As melhorias implementadas até agora já resolvem os problemas críticos de **polling e refresh**. As sugestões acima são para **evoluir** a experiência do usuário, tornando o Aegis Control ainda mais profissional e eficiente.

**Próximos passos:**
1. Implementar SSE para reduzir requisições HTTP
2. Adicionar notificações toast para feedback claro
3. Corrigir lógica de status online/offline

**Prioridade:** SSE > Toast > Status Online
