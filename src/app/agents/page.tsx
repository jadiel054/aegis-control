'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Settings2, RefreshCw, Save, MessageCircle, Server } from 'lucide-react';

interface Agent {
  id: string;
  name: string;
  role: string;
  status: string;
  agent_type: string;
  webhook_url: string | null;
  telegram_chat_ids: string[] | null;
  has_telegram_token?: boolean;
  last_heartbeat: string | null;
  metadata?: Record<string, unknown>;
}

type Filter = 'all' | 'systems' | 'telegram';

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [filter, setFilter] = useState<Filter>('telegram');
  const [selectedId, setSelectedId] = useState('');
  const [token, setToken] = useState('');
  const [chatIds, setChatIds] = useState('');
  const [webhook, setWebhook] = useState('');
  const [agentType, setAgentType] = useState('llm_agent');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/agents');
    const data = await res.json();
    const list: Agent[] = data.agents || [];
    setAgents(list);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (filter === 'telegram') return agents.filter((a) => a.agent_type === 'telegram_bot');
    if (filter === 'systems') return agents.filter((a) => a.agent_type !== 'telegram_bot');
    return agents;
  }, [agents, filter]);

  useEffect(() => {
    if (!filtered.find((a) => a.id === selectedId)) {
      setSelectedId(filtered[0]?.id || '');
    }
  }, [filtered, selectedId]);

  useEffect(() => {
    const a = agents.find((x) => x.id === selectedId);
    if (!a) return;
    setToken('');
    setChatIds((a.telegram_chat_ids || []).join(', '));
    setWebhook(a.webhook_url || '');
    setAgentType(a.agent_type || 'llm_agent');
    setMsg(null);
  }, [selectedId, agents]);

  const save = async () => {
    if (!selectedId) return;
    setSaving(true);
    setMsg(null);
    try {
      const body: Record<string, unknown> = {
        webhook_url: webhook.trim() || null,
        agent_type: agentType,
        telegram_chat_ids: chatIds
          .split(/[,\s]+/)
          .map((s) => s.trim())
          .filter(Boolean),
      };
      if (token.trim()) body.telegram_bot_token = token.trim();

      const res = await fetch(`/api/agents/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'fail');
      setMsg('Salvo');
      setToken('');
      await load();
    } catch (e: any) {
      setMsg(e.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const selected = agents.find((a) => a.id === selectedId);
  const isTelegramBot = selected?.agent_type === 'telegram_bot';

  return (
    <DashboardLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-widest uppercase flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-cyan-400" /> Configuração de Agentes
          </h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">
            Sistemas (Morpheus, Plutão…) ≠ Bots do Telegram (BotFather)
          </p>
        </div>
        <button
          onClick={load}
          className="self-start px-3 py-2 border border-[#1E293B] text-xs uppercase tracking-widest rounded"
        >
          <RefreshCw className="h-3.5 w-3.5 inline mr-2" /> Refresh
        </button>
      </div>

      <div className="flex gap-2 mb-4 text-[10px] uppercase tracking-widest">
        {(
          [
            ['telegram', 'Bots Telegram'],
            ['systems', 'Sistemas'],
            ['all', 'Todos'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`px-3 py-1.5 rounded border ${
              filter === id
                ? 'border-cyan-500/40 bg-cyan-950/30 text-cyan-300'
                : 'border-[#1E293B] text-slate-500'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-2 max-h-[70vh] overflow-y-auto">
          {filtered.length === 0 && (
            <p className="text-xs text-slate-500 p-3">Nenhum agente neste filtro.</p>
          )}
          {filtered.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setSelectedId(a.id)}
              className={`w-full text-left border p-3 rounded text-xs ${
                selectedId === a.id
                  ? 'border-cyan-500/40 bg-cyan-950/20'
                  : 'border-[#1E293B] bg-[#080D17]/80'
              }`}
            >
              <div className="font-bold uppercase tracking-wide flex items-center gap-2">
                {a.agent_type === 'telegram_bot' ? (
                  <MessageCircle className="h-3.5 w-3.5 text-cyan-500" />
                ) : (
                  <Server className="h-3.5 w-3.5 text-slate-500" />
                )}
                {a.name}
              </div>
              <div className="text-slate-500 mt-1 flex justify-between">
                <span>{a.agent_type}</span>
                <span>{a.has_telegram_token ? 'token ok' : 'sem token'}</span>
              </div>
            </button>
          ))}
        </div>

        <div className="lg:col-span-2 border border-[#1E293B] bg-[#080D17]/80 p-5 rounded space-y-4">
          {!selected ? (
            <p className="text-xs text-slate-500">Selecione um agente</p>
          ) : (
            <>
              <div>
                <p className="text-sm font-bold uppercase tracking-widest">{selected.name}</p>
                <p className="text-[10px] text-slate-500 uppercase">{selected.role}</p>
                {!isTelegramBot && (
                  <p className="text-[11px] text-amber-500/90 mt-2 leading-relaxed">
                    Este é um <strong>sistema</strong> (não um bot do BotFather). Token Telegram aqui é
                    opcional — só se quiser que este processo envie alertas no Telegram.
                  </p>
                )}
                {isTelegramBot && (
                  <p className="text-[11px] text-emerald-500/90 mt-2 leading-relaxed">
                    Bot do Telegram. Cole o token do BotFather e o(s) chat_id(s) autorizados. Não
                    compartilhe o token no chat do Grok — só neste campo.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[10px] uppercase text-slate-500 mb-1">Agent type</label>
                <select
                  value={agentType}
                  onChange={(e) => setAgentType(e.target.value)}
                  className="w-full bg-[#070A13] border border-[#1E293B] px-3 py-2 rounded text-sm"
                >
                  <option value="orchestrator">orchestrator (sistema)</option>
                  <option value="worker">worker (sistema)</option>
                  <option value="llm_agent">llm_agent (sistema)</option>
                  <option value="saas">saas (sistema)</option>
                  <option value="telegram_bot">telegram_bot (BotFather)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase text-slate-500 mb-1">
                  Webhook URL (endpoint HTTP do agente)
                </label>
                <input
                  value={webhook}
                  onChange={(e) => setWebhook(e.target.value)}
                  placeholder="https://.../api/agent"
                  className="w-full bg-[#070A13] border border-[#1E293B] px-3 py-2 rounded text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase text-slate-500 mb-1">
                  Telegram bot token{' '}
                  {selected.has_telegram_token && (
                    <span className="text-emerald-400">(já salvo — em branco mantém)</span>
                  )}
                </label>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder={selected.has_telegram_token ? '••••••••' : '123456:ABC... (só no Aegis)'}
                  className="w-full bg-[#070A13] border border-[#1E293B] px-3 py-2 rounded text-sm font-mono"
                  autoComplete="off"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase text-slate-500 mb-1">
                  Chat IDs autorizados (vírgula)
                </label>
                <input
                  value={chatIds}
                  onChange={(e) => setChatIds(e.target.value)}
                  placeholder="6151151338"
                  className="w-full bg-[#070A13] border border-[#1E293B] px-3 py-2 rounded text-sm font-mono"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="px-4 py-2 bg-cyan-900/40 border border-cyan-500/40 text-cyan-300 text-xs uppercase font-bold tracking-widest rounded disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5 inline mr-1" />
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
                {msg && <span className="text-xs text-slate-400">{msg}</span>}
              </div>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
