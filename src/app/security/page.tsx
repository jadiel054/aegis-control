'use client';

import React, { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { ShieldAlert, RefreshCw, Plus } from 'lucide-react';

export default function SecurityPage() {
  const [incidents, setIncidents] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/incidents');
      const data = await res.json();
      setIncidents(data.incidents || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 12000);
    return () => clearInterval(id);
  }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await fetch('/api/incidents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, severity, detected_by: 'manual' }),
    });
    setTitle('');
    await load();
  };

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-widest uppercase flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-red-400" /> Quadro de Segurança
          </h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">Incidentes · Neon</p>
        </div>
        <button onClick={load} className="px-3 py-2 border border-[#1E293B] text-xs uppercase tracking-widest rounded">
          <RefreshCw className="h-3.5 w-3.5 inline mr-2" /> Refresh
        </button>
      </div>

      <form onSubmit={create} className="flex flex-wrap gap-2 mb-6">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título do incidente..."
          className="flex-1 min-w-[200px] bg-[#070A13] border border-[#1E293B] px-3 py-2 rounded text-sm outline-none focus:border-cyan-500"
        />
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          className="bg-[#070A13] border border-[#1E293B] px-3 py-2 rounded text-sm"
        >
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
          <option value="critical">critical</option>
        </select>
        <button type="submit" className="px-4 py-2 bg-red-950/40 border border-red-500/40 text-red-300 text-xs uppercase font-bold tracking-widest rounded">
          <Plus className="h-3.5 w-3.5 inline mr-1" /> Registrar
        </button>
      </form>

      {loading ? (
        <p className="text-xs text-cyan-400">Carregando...</p>
      ) : incidents.length === 0 ? (
        <p className="text-xs text-slate-500">Nenhum incidente.</p>
      ) : (
        <div className="space-y-2">
          {incidents.map((i) => (
            <div key={i.id} className="border border-[#1E293B] bg-[#080D17]/80 p-4 rounded">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-semibold text-slate-200">{i.title}</p>
                  <p className="text-[10px] text-slate-500 uppercase mt-1">
                    {i.severity} · {i.status} · {i.agent_name || 'system'}
                  </p>
                </div>
                <span className="text-[10px] text-slate-600">{new Date(i.created_at).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
