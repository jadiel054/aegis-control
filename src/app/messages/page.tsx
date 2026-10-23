'use client';

import React, { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Activity, RefreshCw } from 'lucide-react';

export default function MessagesPage() {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/messages?limit=100');
      const data = await res.json();
      setMessages(data.messages || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-widest uppercase flex items-center gap-2">
            <Activity className="h-5 w-5 text-cyan-400" /> Feed de Mensagens
          </h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">Dispatch log · polling 8s</p>
        </div>
        <button onClick={load} className="px-3 py-2 border border-[#1E293B] text-xs uppercase tracking-widest rounded">
          <RefreshCw className="h-3.5 w-3.5 inline mr-2" /> Refresh
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-cyan-400">Carregando...</p>
      ) : messages.length === 0 ? (
        <p className="text-xs text-slate-500">Nenhuma mensagem ainda. Agentes usando o SDK vão aparecer aqui.</p>
      ) : (
        <div className="space-y-2 font-mono text-xs">
          {messages.map((m) => (
            <div key={m.id} className="border border-[#1E293B] bg-[#080D17]/80 p-3 rounded">
              <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                <span>
                  {m.from_agent_name || m.from_agent_id}
                  {m.to_agent_name ? ` → ${m.to_agent_name}` : ''}
                  <span className="ml-2 text-cyan-500/80">{m.type}</span>
                </span>
                <span>{new Date(m.created_at).toLocaleString()}</span>
              </div>
              <p className="text-slate-300">{m.content}</p>
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
