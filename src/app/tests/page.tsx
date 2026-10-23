'use client';

import React, { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { FlaskConical, RefreshCw, Play } from 'lucide-react';

export default function TestsPage() {
  const [agents, setAgents] = useState<any[]>([]);
  const [agentId, setAgentId] = useState('');
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const [commands, setCommands] = useState<any[]>([]);

  const load = useCallback(async () => {
    const [a, c] = await Promise.all([
      fetch('/api/agents').then((r) => r.json()),
      fetch('/api/commands').then((r) => r.json()),
    ]);
    setAgents(a.agents || []);
    setCommands((c.commands || []).filter((x: any) => x.command_type === 'run_diagnostic').slice(0, 20));
    if (!agentId && a.agents?.[0]) setAgentId(a.agents[0].id);
  }, [agentId]);

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);

  const runDiagnostic = async () => {
    if (!agentId) return;
    setRunning(true);
    setLastResult(null);
    try {
      const res = await fetch('/api/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agentId,
          command_type: 'run_diagnostic',
          issued_by: 'operator',
          payload: { source: 'tests-panel' },
        }),
      });
      const data = await res.json();
      setLastResult(data);
      await load();
    } finally {
      setRunning(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-widest uppercase flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-cyan-400" /> Painel de Testes
          </h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">
            Dispara run_diagnostic nos agentes · Neon
          </p>
        </div>
        <button onClick={load} className="px-3 py-2 border border-[#1E293B] text-xs uppercase tracking-widest rounded">
          <RefreshCw className="h-3.5 w-3.5 inline mr-2" /> Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-6 items-end">
        <div>
          <label className="block text-[10px] uppercase text-slate-500 mb-1">Agente</label>
          <select
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="bg-[#070A13] border border-[#1E293B] px-3 py-2 rounded text-sm min-w-[180px]"
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.status})
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={runDiagnostic}
          disabled={running || !agentId}
          className="px-4 py-2 bg-cyan-900/40 border border-cyan-500/40 text-cyan-300 text-xs uppercase font-bold tracking-widest rounded disabled:opacity-50"
        >
          <Play className="h-3.5 w-3.5 inline mr-1" />
          {running ? 'Running...' : 'Run diagnostic'}
        </button>
      </div>

      {lastResult && (
        <div className="mb-6 border border-[#1E293B] bg-[#080D17]/80 p-4 rounded text-xs font-mono text-slate-300">
          <p className="text-cyan-400 font-bold mb-2 uppercase">Last result</p>
          <pre className="whitespace-pre-wrap overflow-x-auto">{JSON.stringify(lastResult, null, 2)}</pre>
        </div>
      )}

      <h2 className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">Histórico run_diagnostic</h2>
      <div className="space-y-2">
        {commands.length === 0 && <p className="text-xs text-slate-500">Nenhum diagnostic ainda.</p>}
        {commands.map((c) => (
          <div key={c.id} className="border border-[#1E293B] bg-[#080D17]/80 p-3 rounded text-xs flex justify-between">
            <span>
              <span className="text-cyan-400">{c.status}</span>
              <span className="text-slate-500 ml-2">{c.issued_by}</span>
            </span>
            <span className="text-slate-600">{new Date(c.created_at).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </DashboardLayout>
  );
}
