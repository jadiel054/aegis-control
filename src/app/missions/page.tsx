'use client';

import React, { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { ListTodo, RefreshCw, Play, CheckCircle2, XCircle, Clock, Eye, ChevronDown, ChevronUp } from 'lucide-react';

interface Mission {
  id: string;
  title: string;
  description: string | null;
  status: 'pending' | 'in_progress' | 'done' | 'rejected' | 'failed';
  priority: 'low' | 'medium' | 'high';
  assigned_agent_id: string | null;
  assigned_agent_name: string | null;
  current_step: number | null;
  created_at: string;
  updated_at: string;
  result_summary: string | null;
  plan: any;
}

interface MissionStep {
  id: string;
  task_id: string;
  step_index: number;
  role: string;
  agent_name: string | null;
  agent_id: string | null;
  status: 'pending' | 'ready' | 'running' | 'awaiting_approval' | 'approved' | 'done' | 'rejected' | 'failed';
  requires_approval: boolean;
  execution_mode: 'real' | 'simulated';
  input: string | null;
  output: string | null;
  started_at: string | null;
  finished_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

interface MissionWithSteps extends Mission {
  steps: MissionStep[];
}

export default function MissionsPage() {
  const [missions, setMissions] = useState<MissionWithSteps[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedMission, setExpandedMission] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'pending' | 'done' | 'failed'>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadMissions = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/tasks');
      const data = await res.json();
      const tasks = data.tasks || [];
      
      const missionsWithSteps: MissionWithSteps[] = await Promise.all(
        tasks.map(async (task: Mission) => {
          try {
            const stepsRes = await fetch(`/api/tasks/${task.id}/steps`);
            const stepsData = await stepsRes.json();
            return {
              ...task,
              steps: stepsData.steps || [],
            };
          } catch (error) {
            console.error(`Failed to load steps for task ${task.id}:`, error);
            return { ...task, steps: [] };
          }
        })
      );
      
      setMissions(missionsWithSteps);
    } catch (err) {
      console.error('Error loading missions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMissions();
    const interval = setInterval(loadMissions, 10000);
    return () => clearInterval(interval);
  }, [loadMissions]);

  const toggleExpand = (missionId: string) => {
    setExpandedMission(expandedMission === missionId ? null : missionId);
  };

  const handleApprove = async (missionId: string) => {
    setActionLoading(missionId);
    setActionMessage(null);
    try {
      const res = await fetch('/api/missions/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: missionId, approvedBy: 'operator' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao aprovar');
      setActionMessage('Missão aprovada com sucesso!');
      await loadMissions();
    } catch (err: any) {
      setActionMessage(err.message || 'Erro ao aprovar missão');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (missionId: string) => {
    setActionLoading(missionId);
    setActionMessage(null);
    try {
      const res = await fetch('/api/missions/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: missionId, reason: 'Rejeitado pelo operador', by: 'operator' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao rejeitar');
      setActionMessage('Missão rejeitada!');
      await loadMissions();
    } catch (err: any) {
      setActionMessage(err.message || 'Erro ao rejeitar missão');
    } finally {
      setActionLoading(null);
    }
  };

  const handleAdvance = async (missionId: string) => {
    setActionLoading(missionId);
    setActionMessage(null);
    try {
      const res = await fetch('/api/missions/advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: missionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao avançar');
      setActionMessage('Missão avançada!');
      await loadMissions();
    } catch (err: any) {
      setActionMessage(err.message || 'Erro ao avançar missão');
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'done':
        return 'border-emerald-500/40 bg-emerald-950/20 text-emerald-400';
      case 'in_progress':
        return 'border-cyan-500/40 bg-cyan-950/20 text-cyan-400';
      case 'awaiting_approval':
      case 'pending':
        return 'border-amber-500/40 bg-amber-950/20 text-amber-400';
      case 'rejected':
      case 'failed':
        return 'border-red-500/40 bg-red-950/20 text-red-400';
      default:
        return 'border-slate-700 bg-slate-900/40 text-slate-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'done':
        return <CheckCircle2 className="h-3.5 w-3.5" />;
      case 'in_progress':
        return <Clock className="h-3.5 w-3.5" />;
      case 'awaiting_approval':
        return <Clock className="h-3.5 w-3.5" />;
      case 'pending':
        return <Clock className="h-3.5 w-3.5" />;
      case 'rejected':
      case 'failed':
        return <XCircle className="h-3.5 w-3.5" />;
      default:
        return <ListTodo className="h-3.5 w-3.5" />;
    }
  };

  const getStepStatusColor = (status: string) => {
    switch (status) {
      case 'done':
        return 'text-emerald-400';
      case 'approved':
        return 'text-cyan-400';
      case 'running':
        return 'text-amber-400';
      case 'awaiting_approval':
        return 'text-amber-500';
      case 'rejected':
      case 'failed':
        return 'text-red-400';
      default:
        return 'text-slate-400';
    }
  };

  const filteredMissions = missions.filter((m) => {
    if (filter === 'all') return true;
    if (filter === 'active') return m.status === 'in_progress';
    if (filter === 'pending') return m.status === 'pending' || m.steps.some(s => s.status === 'awaiting_approval');
    if (filter === 'done') return m.status === 'done';
    if (filter === 'failed') return m.status === 'failed' || m.status === 'rejected';
    return true;
  });

  const hasAwaitingApproval = (mission: MissionWithSteps) => {
    return mission.steps.some(s => s.status === 'awaiting_approval');
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-widest uppercase flex items-center gap-2">
            <ListTodo className="h-5 w-5 text-cyan-400" /> Quadro de Missões
          </h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">Acompanhamento de execução  Neon  Polling 10s</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadMissions} className="px-3 py-2 border border-[#1E293B] text-xs uppercase tracking-widest rounded hover:bg-[#121A2E] transition-colors">
            <RefreshCw className="h-3.5 w-3.5 inline mr-2" /> Refresh
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-4 text-[10px] uppercase tracking-widest">
        {(
          [
            ['all', 'Todas'],
            ['active', 'Ativas'],
            ['pending', 'Pendentes'],
            ['done', 'Concluídas'],
            ['failed', 'Falhas/Rejeitadas'],
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
            {label} {filter === id && `(${filteredMissions.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-xs text-cyan-400">
          <RefreshCw className="h-4 w-4 animate-spin mr-2" />
          <span>Carregando missões...</span>
        </div>
      ) : filteredMissions.length === 0 ? (
        <p className="text-xs text-slate-500 text-center py-8">Nenhuma missão encontrada.</p>
      ) : (
        <div className="space-y-4">
          {filteredMissions.map((mission) => {
            const isExpanded = expandedMission === mission.id;
            const hasApproval = hasAwaitingApproval(mission);
            const currentStep = mission.steps.find(s => s.step_index === (mission.current_step ?? 0));
            
            return (
              <div key={mission.id} className="border border-[#1E293B] bg-[#080D17]/80 rounded">
                <div className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className={`border rounded px-2 py-0.5 text-[10px] uppercase font-bold ${getStatusColor(mission.status)}`}>
                          {getStatusIcon(mission.status)}
                          {mission.status.replace('_', ' ')}
                        </span>
                        <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">{mission.title}</h3>
                        {mission.priority === 'high' && (
                          <span className="text-[10px] text-red-400 uppercase font-bold">[PRIORIDADE ALTA]</span>
                        )}
                      </div>
                      
                      <div className="flex flex-wrap gap-4 text-[10px] text-slate-500 uppercase tracking-wider">
                        <span>ID: {mission.id.slice(0, 8)}...</span>
                        <span>Agente: {mission.assigned_agent_name || 'unassigned'}</span>
                        <span>Passos: {mission.steps.length}</span>
                        <span>Criada: {new Date(mission.created_at).toLocaleString()}</span>
                      </div>
                      
                      {mission.description && (
                        <p className="text-xs text-slate-400 mt-2">{mission.description}</p>
                      )}
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => toggleExpand(mission.id)}
                        className="p-1.5 rounded border border-[#1E293B] hover:bg-[#121A2E] text-slate-400 hover:text-cyan-400"
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        <span className="text-[10px] uppercase ml-1">{isExpanded ? 'Recolher' : 'Detalhes'}</span>
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-[#1E293B]/60">
                      <div className="mb-3">
                        <h4 className="text-[10px] uppercase text-slate-500 mb-2">Pipeline de Execução</h4>
                        <div className="space-y-3">
                          {mission.steps.map((step, idx) => {
                            const isCurrent = step.step_index === (mission.current_step ?? 0);
                            const isLast = idx === mission.steps.length - 1;
                            
                            return (
                              <div key={step.id} className="flex items-start gap-3 p-3 border border-[#1E293B]/60 rounded bg-[#070A13]/60">
                                <div className="flex flex-col items-center">
                                  <span className={`text-xs font-bold ${getStepStatusColor(step.status)}`}>
                                    {step.step_index + 1}
                                  </span>
                                  {isCurrent && (
                                    <span className="text-[8px] text-cyan-400 mt-1">CURRENT</span>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-semibold text-slate-300">{step.role}</span>
                                    <span className="text-[10px] text-slate-500">{step.agent_name || 'unassigned'}</span>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${step.execution_mode === 'real' ? 'bg-amber-950/30 text-amber-400' : 'bg-slate-800 text-slate-500'}`}>
                                      {step.execution_mode.toUpperCase()}
                                    </span>
                                    {step.requires_approval && (
                                      <span className="text-[10px] text-amber-400">⚠️ Requires Approval</span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-slate-500 uppercase">
                                    Status: <span className={getStepStatusColor(step.status)}>{step.status.replace('_', ' ')}</span>
                                  </div>
                                  {step.output && (
                                    <p className="text-xs text-slate-400 mt-2 line-clamp-2">{step.output}</p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-2 border-t border-[#1E293B]/60">
                        {hasApproval && (
                          <>
                            <button
                              onClick={() => handleApprove(mission.id)}
                              disabled={actionLoading === mission.id}
                              className="px-3 py-1.5 bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-[10px] uppercase font-bold rounded disabled:opacity-50"
                            >
                              <CheckCircle2 className="h-3 w-3 inline mr-1" />
                              {actionLoading === mission.id ? 'Aprovando...' : 'Aprovar'}
                            </button>
                            <button
                              onClick={() => handleReject(mission.id)}
                              disabled={actionLoading === mission.id}
                              className="px-3 py-1.5 bg-red-950/40 border border-red-500/40 text-red-300 text-[10px] uppercase font-bold rounded disabled:opacity-50"
                            >
                              <XCircle className="h-3 w-3 inline mr-1" />
                              {actionLoading === mission.id ? 'Rejeitando...' : 'Rejeitar'}
                            </button>
                          </>
                        )}
                        {mission.status === 'pending' && !hasApproval && (
                          <button
                            onClick={() => handleAdvance(mission.id)}
                            disabled={actionLoading === mission.id}
                            className="px-3 py-1.5 bg-cyan-950/40 border border-cyan-500/40 text-cyan-300 text-[10px] uppercase font-bold rounded disabled:opacity-50"
                          >
                            <Play className="h-3 w-3 inline mr-1" />
                            {actionLoading === mission.id ? 'Iniciando...' : 'Iniciar'}
                          </button>
                        )}
                      </div>

                      {mission.result_summary && (
                        <div className="mt-4 pt-3 border-t border-[#1E293B]/60">
                          <h4 className="text-[10px] uppercase text-slate-500 mb-2">Resultado Final</h4>
                          <p className="text-xs text-slate-300">{mission.result_summary}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {actionMessage && (
        <div className="fixed bottom-6 right-6 z-50">
          <div className="border border-cyan-500/40 bg-cyan-950/40 text-cyan-200 px-4 py-2 rounded text-xs uppercase tracking-wider">
            {actionMessage}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
