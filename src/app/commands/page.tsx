'use client';

import React, { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Terminal, RefreshCw, Send } from 'lucide-react';

export default function CommandsPage() {
  const [agents, setAgents] = useState<any[]>([]);
  const [commands, setCommands] = useState<any[]>([]);
  const [agentId, setAgentId] = useState('');
  const [commandType, setCommandType] = useState('run_diagnostic');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const [a, c] = await Promise.all([
        fetch('/api/agents').then((r) => r.json()),
        fetch('/api/commands').then((r) => r.json()),
      ]);
      setAgents(a.agents || []);
      setCommands(c.commands || []);
      if (!agentId && a.agents?.[0]) setAgentId(a.agents[0].id);
    } catch (error) {
      console.error('Failed to load commands:', error);
    }
  }, [agentId]);

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);

  const dispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentId) return;
    setSending(true);
    try {
      await fetch('/api/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId, command_type: commandType, issued_by: 'operator' }),
      });
      await load();
    } finally {
      setSending(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-widest uppercase flex items-center gap-2">
            <Terminal className="h-5 w-5 text-cyan-400" /> Painel de Comandos
          </h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">Dispatch remoto via webhook</p>
        </div>
        <button onClick={load} className="px-3 py-2 border border-[#1E293B] text-xs uppercase tracking-widest rounded hover:bg-[#121A2E] transition-colors">
          <RefreshCw className="h-3.5 w-3.5 inline mr-2" /> Refresh
        </button>
      </div>

      <form onSubmit={dispatch} className="flex flex-wrap gap-3 mb-8 items-end">
        <div>
          <label className="block text-[10px] uppercase text-slate-500 mb-1">Agente</label>
          <select
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="bg-[#070A13] border border-[#1E293B] px-3 py-2 rounded text-sm min-w-[180px]"
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase text-slate-500 mb-1">Comando</label>
          <select
            value={commandType}
            onChange={(e) => setCommandType(e.target.value)}
            className="bg-[#070A13] border border-[#1E293B] px-3 py-2 rounded text-sm"
          >
            <option value="run_diagnostic">run_diagnostic</option>
            <option value="restart">restart</option>
            <option value="redeploy">redeploy</option>
            <option value="custom">custom</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={sending}
          className="px-4 py-2 bg-cyan-900/40 border border-cyan-500/40 text-cyan-300 text-xs uppercase font-bold tracking-widest rounded disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5 inline mr-1" /> Dispatch
        </button>
      </form>

      <div className="space-y-2">
        {commands.map((c) => (
          <div key={c.id} className="border border-[#1E293B] bg-[#080D17]/80 p-3 rounded text-xs flex justify-between">
            <span>
              <span className="text-cyan-400 font-bold">{c.command_type}</span>
              <span className="text-slate-500 ml-2">{c.status}</span>
            </span>
            <span className="text-slate-600">{new Date(c.created_at).toLocaleString()}</span>
          </div>
        ))}
        {commands.length === 0 && <p className="text-xs text-slate-500">Nenhum comando ainda.</p>}
      </div>
    </DashboardLayout>
  );
}
