'use client';

import React, { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { ListTodo, RefreshCw, Plus } from 'lucide-react';

export default function TasksPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks');
      const data = await res.json();
      setTasks(data.tasks || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);

  const createTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    try {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, created_by: 'operator' }),
      });
      setTitle('');
      await load();
    } finally {
      setCreating(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-widest uppercase flex items-center gap-2">
            <ListTodo className="h-5 w-5 text-cyan-400" /> Quadro de Tarefas
          </h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">Neon · polling 10s</p>
        </div>
        <button onClick={load} className="px-3 py-2 border border-[#1E293B] text-xs uppercase tracking-widest rounded hover:bg-[#121A2E]">
          <RefreshCw className="h-3.5 w-3.5 inline mr-2" /> Refresh
        </button>
      </div>

      <form onSubmit={createTask} className="flex gap-2 mb-6">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Nova tarefa..."
          className="flex-1 bg-[#070A13] border border-[#1E293B] px-3 py-2 rounded text-sm focus:border-cyan-500 outline-none"
        />
        <button
          type="submit"
          disabled={creating}
          className="px-4 py-2 bg-cyan-900/40 border border-cyan-500/40 text-cyan-300 text-xs uppercase font-bold tracking-widest rounded disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5 inline mr-1" /> Criar
        </button>
      </form>

      {loading ? (
        <p className="text-xs text-cyan-400">Carregando...</p>
      ) : tasks.length === 0 ? (
        <p className="text-xs text-slate-500">Nenhuma tarefa ainda.</p>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => (
            <div key={t.id} className="border border-[#1E293B] bg-[#080D17]/80 p-4 rounded flex justify-between items-start gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-200">{t.title}</p>
                <p className="text-[10px] text-slate-500 uppercase mt-1">
                  {t.status} · {t.priority} · {t.assigned_agent_name || 'unassigned'}
                </p>
              </div>
              <span className="text-[10px] text-slate-600">{new Date(t.created_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
