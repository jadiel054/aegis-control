'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { supabase } from '@/lib/supabaseClient';
import {
  KanbanSquare,
  Plus,
  X,
  User,
  ArrowRight,
  AlertCircle,
  Clock,
  ArrowLeftRight,
  Loader2
} from 'lucide-react';

interface Agent {
  id: string;
  name: string;
}

interface Task {
  id: string;
  title: string;
  description: string;
  assigned_agent_id: string | null;
  status: 'pending' | 'in_progress' | 'done' | 'failed';
  priority: 'low' | 'medium' | 'high';
  created_by: string;
  created_at: string;
  updated_at: string;
}

const STATUS_COLUMNS = [
  { id: 'pending', name: 'Pendentes', color: 'border-slate-800 bg-slate-950/30 text-slate-400' },
  { id: 'in_progress', name: 'Em Progresso', color: 'border-amber-900/30 bg-amber-950/5 text-amber-400' },
  { id: 'done', name: 'Concluídas', color: 'border-emerald-900/30 bg-emerald-950/5 text-emerald-400' },
  { id: 'failed', name: 'Falhas', color: 'border-red-900/30 bg-red-950/5 text-red-400' },
];

export default function KanbanPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // New task form state
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newAssignedAgent, setNewAssignedAgent] = useState('');
  const [newPriority, setNewPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [newCreatedBy, setNewCreatedBy] = useState('Operator');

  const fetchData = async () => {
    try {
      const { data: agentsData } = await supabase.from('agents').select('id, name').order('name');
      const { data: tasksData } = await supabase.from('tasks').select('*').order('created_at', { ascending: false });

      if (agentsData) setAgents(agentsData);
      if (tasksData) setTasks(tasksData as Task[]);
    } catch (err) {
      console.error('Error fetching tasks/agents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Realtime subscription for tasks
    const tasksChannel = supabase
      .channel('tasks-kanban')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setTasks((prev) => [payload.new as Task, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setTasks((prev) =>
              prev.map((t) => (t.id === (payload.new as Task).id ? (payload.new as Task) : t))
            );
          } else if (payload.eventType === 'DELETE') {
            setTasks((prev) => prev.filter((t) => t.id !== (payload.old as any).id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(tasksChannel);
    };
  }, []);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle) return;

    setSubmitLoading(true);
    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          description: newDescription,
          assigned_agent_id: newAssignedAgent || null,
          priority: newPriority,
          created_by: newCreatedBy || 'Operator',
          status: 'pending',
        }),
      });

      if (response.ok) {
        setIsModalOpen(false);
        setNewTitle('');
        setNewDescription('');
        setNewAssignedAgent('');
        setNewPriority('medium');
      }
    } catch (error) {
      console.error('Error creating task:', error);
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, nextStatus: Task['status']) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!response.ok) {
        console.error('Failed to update task status');
      }
    } catch (err) {
      console.error('Error updating task:', err);
    }
  };

  const getPriorityColor = (priority: Task['priority']) => {
    switch (priority) {
      case 'high':
        return 'text-red-400 border-red-500/30 bg-red-950/20';
      case 'medium':
        return 'text-amber-400 border-amber-500/30 bg-amber-950/20';
      case 'low':
        return 'text-emerald-400 border-emerald-500/30 bg-emerald-950/20';
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex h-64 items-center justify-center text-xs text-cyan-400">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          <span>SYNCHRONIZING SECURE COMMAND MATRIX...</span>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-xl font-bold tracking-widest text-[#F3F4F6] uppercase">QUADRO DE TAREFAS (KANBAN)</h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">
            Dispatch, tracking and synchronization of administrative duties
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="self-start flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold uppercase tracking-widest rounded transition-all duration-150 shadow-[0_0_12px_rgba(34,211,238,0.25)]"
        >
          <Plus className="h-4 w-4" />
          <span>Nova Tarefa</span>
        </button>
      </div>

      {/* Kanban Board Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {STATUS_COLUMNS.map((column) => {
          const columnTasks = tasks.filter((task) => task.status === column.id);

          return (
            <div
              key={column.id}
              className={`flex flex-col h-[70vh] border rounded p-4 ${column.color}`}
            >
              {/* Column Header */}
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
                <span className="text-xs font-bold uppercase tracking-widest text-[#F3F4F6]">
                  {column.name}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-slate-800 bg-[#070B14]">
                  {columnTasks.length}
                </span>
              </div>

              {/* Scrollable Column Content */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                {columnTasks.length === 0 ? (
                  <div className="h-32 flex flex-col items-center justify-center border border-dashed border-slate-800 rounded text-slate-600 text-[10px] uppercase font-bold tracking-wider">
                    <span>Sem tarefas</span>
                  </div>
                ) : (
                  columnTasks.map((task) => {
                    const assignedAgent = agents.find((a) => a.id === task.assigned_agent_id);

                    return (
                      <div
                        key={task.id}
                        className="border border-[#1E293B] bg-[#070A13] hover:bg-[#0C1221] p-4 rounded transition-all duration-150 flex flex-col justify-between h-48 group shadow-sm hover:shadow-cyan-950/10"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <h4 className="text-xs font-bold text-slate-200 line-clamp-1 uppercase tracking-wide">
                              {task.title}
                            </h4>
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${getPriorityColor(
                                task.priority
                              )}`}
                            >
                              {task.priority.toUpperCase()}
                            </span>
                          </div>

                          <p className="text-[10px] text-slate-500 line-clamp-3 mb-4 font-mono leading-relaxed">
                            {task.description || 'Nenhuma descrição fornecida.'}
                          </p>
                        </div>

                        {/* Footer card */}
                        <div>
                          <div className="flex items-center justify-between text-[9px] text-slate-400 border-t border-[#1E293B]/60 pt-2 mb-2">
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3 text-slate-500" />
                              <span className="truncate max-w-[80px]" title={task.created_by}>
                                {task.created_by}
                              </span>
                            </span>
                            <span className="text-slate-500 font-semibold uppercase">
                              {assignedAgent ? `@${assignedAgent.name}` : 'UNASSIGNED'}
                            </span>
                          </div>

                          {/* Quick status moves */}
                          <div className="flex items-center justify-between border-t border-[#1E293B]/20 pt-1.5">
                            <span className="text-[8px] text-slate-600 uppercase font-semibold">Mover status:</span>
                            <select
                              value={task.status}
                              onChange={(e) => handleUpdateTaskStatus(task.id, e.target.value as any)}
                              className="bg-[#05070C] text-[9px] text-cyan-400 font-bold border border-slate-800 rounded px-1.5 py-0.5 focus:outline-none focus:border-cyan-500 uppercase cursor-pointer"
                            >
                              <option value="pending">Pendente</option>
                              <option value="in_progress">Progresso</option>
                              <option value="done">Concluída</option>
                              <option value="failed">Falha</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Task Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="relative w-full max-w-lg border border-[#1E293B] bg-[#0A0F1D] rounded shadow-2xl p-6 font-mono">
            {/* Neon Accent */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-500 to-blue-500"></div>

            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-bold uppercase tracking-widest text-[#F3F4F6] flex items-center gap-2">
                <KanbanSquare className="h-4.5 w-4.5 text-cyan-400" />
                <span>Nova Tarefa Administrativa</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-500 hover:text-slate-200 hover:bg-slate-800/40 p-1 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5 tracking-wider">
                  Título da Tarefa *
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ex: Executar auditoria de logs criptográficos"
                  className="w-full bg-[#05070C] border border-[#1E293B] px-3 py-2 rounded text-xs text-slate-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5 tracking-wider">
                  Descrição / Instruções
                </label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Detalhamento das operações esperadas pelo agente de IA..."
                  rows={3}
                  className="w-full bg-[#05070C] border border-[#1E293B] px-3 py-2 rounded text-xs text-slate-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5 tracking-wider">
                    Atribuir Agente
                  </label>
                  <select
                    value={newAssignedAgent}
                    onChange={(e) => setNewAssignedAgent(e.target.value)}
                    className="w-full bg-[#05070C] border border-[#1E293B] px-3 py-2 rounded text-xs text-slate-300 focus:outline-none focus:border-cyan-500 cursor-pointer"
                  >
                    <option value="">Nenhum (Backlog Geral)</option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5 tracking-wider">
                    Prioridade
                  </label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as any)}
                    className="w-full bg-[#05070C] border border-[#1E293B] px-3 py-2 rounded text-xs text-slate-300 focus:outline-none focus:border-cyan-500 cursor-pointer"
                  >
                    <option value="low">Baixa (Green)</option>
                    <option value="medium">Média (Yellow)</option>
                    <option value="high">Alta (Red)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5 tracking-wider">
                  Operador Responsável
                </label>
                <input
                  type="text"
                  required
                  value={newCreatedBy}
                  onChange={(e) => setNewCreatedBy(e.target.value)}
                  placeholder="Identificação do operador"
                  className="w-full bg-[#05070C] border border-[#1E293B] px-3 py-2 rounded text-xs text-slate-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                />
              </div>

              <div className="flex gap-3 pt-4 border-t border-[#1E293B] justify-end">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-[#1E293B] hover:border-slate-500 text-slate-300 rounded text-[11px] font-bold uppercase tracking-wider transition-all duration-150"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitLoading}
                  className="flex items-center gap-1.5 px-5 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded text-[11px] font-bold uppercase tracking-widest transition-all duration-150 shadow-[0_0_15px_rgba(34,211,238,0.25)] disabled:opacity-55"
                >
                  {submitLoading ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>DISPATCHING...</span>
                    </>
                  ) : (
                    <span>DISPATCH TASK</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
