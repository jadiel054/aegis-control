'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { supabase } from '@/lib/supabaseClient';
import {
  ShieldAlert,
  ShieldCheck,
  Plus,
  Loader2,
  X,
  AlertTriangle,
  FileText,
  Clock,
  ArrowRight,
  User
} from 'lucide-react';

interface Agent {
  id: string;
  name: string;
}

interface SecurityIncident {
  id: string;
  agent_id: string | null;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  status: 'open' | 'investigating' | 'resolved';
  detected_by: 'manual' | 'automatic';
  resolution_notes: string | null;
  created_at: string;
  resolved_at: string | null;
}

export default function SecurityPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [incidents, setIncidents] = useState<SecurityIncident[]>([]);
  const [loading, setLoading] = useState(true);

  // New incident modal/form state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newAgent, setNewAgent] = useState('');
  const [newSeverity, setNewSeverity] = useState<SecurityIncident['severity']>('high');
  const [newDetectedBy, setNewDetectedBy] = useState<SecurityIncident['detected_by']>('manual');
  const [submitLoading, setSubmitLoading] = useState(false);

  // Resolve incident details state
  const [selectedIncident, setSelectedIncident] = useState<SecurityIncident | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [statusUpdate, setStatusUpdate] = useState<'investigating' | 'resolved'>('investigating');
  const [resolveLoading, setResolveLoading] = useState(false);

  const fetchData = async () => {
    try {
      const { data: agentsData } = await supabase.from('agents').select('id, name').order('name');
      const { data: incidentsData } = await supabase
        .from('security_incidents')
        .select('*')
        .order('created_at', { ascending: false });

      if (agentsData) setAgents(agentsData);
      if (incidentsData) setIncidents(incidentsData as SecurityIncident[]);
    } catch (err) {
      console.error('Error fetching incidents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Subscribe to realtime security incidents
    const incidentsChannel = supabase
      .channel('incidents-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'security_incidents' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setIncidents((prev) => [payload.new as SecurityIncident, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setIncidents((prev) =>
              prev.map((i) =>
                i.id === (payload.new as SecurityIncident).id ? (payload.new as SecurityIncident) : i
              )
            );
            // If the currently viewed incident in the action drawer was updated, update details
            setSelectedIncident((current) =>
              current && current.id === (payload.new as SecurityIncident).id
                ? (payload.new as SecurityIncident)
                : current
            );
          } else if (payload.eventType === 'DELETE') {
            setIncidents((prev) => prev.filter((i) => i.id !== (payload.old as any).id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(incidentsChannel);
    };
  }, []);

  const handleCreateIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle || !newSeverity) return;

    setSubmitLoading(true);
    try {
      const response = await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          description: newDescription,
          agent_id: newAgent || null,
          severity: newSeverity,
          detected_by: newDetectedBy,
          status: 'open',
        }),
      });

      if (response.ok) {
        setIsCreateOpen(false);
        setNewTitle('');
        setNewDescription('');
        setNewAgent('');
        setNewSeverity('high');
      }
    } catch (error) {
      console.error('Error reporting incident:', error);
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleUpdateIncidentStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIncident) return;

    setResolveLoading(true);
    try {
      const response = await fetch(`/api/incidents/${selectedIncident.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: statusUpdate,
          resolution_notes: resolutionNotes,
        }),
      });

      if (response.ok) {
        setResolutionNotes('');
        setSelectedIncident(null);
      }
    } catch (error) {
      console.error('Error updating incident status:', error);
    } finally {
      setResolveLoading(false);
    }
  };

  const getSeverityBadge = (severity: SecurityIncident['severity']) => {
    switch (severity) {
      case 'critical':
        return 'text-red-500 border-red-500/30 bg-red-950/20 shadow-[0_0_8px_rgba(239,68,68,0.25)] font-bold animate-pulse';
      case 'high':
        return 'text-orange-400 border-orange-500/30 bg-orange-950/20 font-bold';
      case 'medium':
        return 'text-yellow-400 border-yellow-500/30 bg-yellow-950/20';
      case 'low':
        return 'text-slate-400 border-slate-500/30 bg-slate-950/20';
    }
  };

  const getStatusBadge = (status: SecurityIncident['status']) => {
    switch (status) {
      case 'open':
        return 'text-red-400 border-red-900 bg-red-950/10';
      case 'investigating':
        return 'text-amber-400 border-amber-900 bg-amber-950/10';
      case 'resolved':
        return 'text-emerald-400 border-emerald-900 bg-emerald-950/10';
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

  const activeIncidents = incidents.filter((i) => i.status !== 'resolved');
  const resolvedIncidents = incidents.filter((i) => i.status === 'resolved');

  return (
    <DashboardLayout>
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-xl font-bold tracking-widest text-[#F3F4F6] uppercase">QUADRO DE SEGURANÇA (SOC)</h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">
            Real-time security auditing, threat detection and resolution
          </p>
        </div>
        <button
          onClick={() => setIsCreateOpen(true)}
          className="self-start flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-widest rounded transition-all duration-150 shadow-[0_0_12px_rgba(239,68,68,0.25)]"
        >
          <AlertTriangle className="h-4 w-4" />
          <span>Reportar Incidente</span>
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Left Column: Active Incidents List (Table style) */}
        <div className="xl:col-span-2 space-y-6">
          <div className="border border-[#1E293B] bg-[#080D17]/80 rounded p-6">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-300 mb-6 flex items-center gap-2">
              <ShieldAlert className="h-4.5 w-4.5 text-red-500 animate-pulse" />
              <span>Incidentes Ativos Requerendo Resolução ({activeIncidents.length})</span>
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs text-slate-300">
                <thead>
                  <tr className="border-b border-[#1E293B] text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                    <th className="pb-3">Severidade</th>
                    <th className="pb-3">Incidente / Título</th>
                    <th className="pb-3">Agente</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3">Detecção</th>
                    <th className="pb-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E293B]/40">
                  {activeIncidents.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-600 uppercase font-bold">
                        Não existem ameaças ativas detectadas no ecossistema
                      </td>
                    </tr>
                  ) : (
                    activeIncidents.map((incident) => {
                      const agentName = agents.find((a) => a.id === incident.agent_id)?.name || 'Todos / Geral';

                      return (
                        <tr key={incident.id} className="hover:bg-[#0E1525]/30 transition-all duration-100">
                          <td className="py-3.5 pr-2">
                            <span className={`text-[9px] font-extrabold tracking-widest px-1.5 py-0.5 rounded border uppercase ${getSeverityBadge(incident.severity)}`}>
                              {incident.severity}
                            </span>
                          </td>
                          <td className="py-3.5 pr-2">
                            <div className="font-bold text-slate-200 uppercase tracking-wide">{incident.title}</div>
                            <div className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">{incident.description || 'Sem descrição'}</div>
                          </td>
                          <td className="py-3.5 text-slate-400 uppercase font-semibold">@{agentName}</td>
                          <td className="py-3.5">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase ${getStatusBadge(incident.status)}`}>
                              {incident.status}
                            </span>
                          </td>
                          <td className="py-3.5 text-[10px] text-slate-500 uppercase">{incident.detected_by}</td>
                          <td className="py-3.5 text-right">
                            <button
                              onClick={() => {
                                setSelectedIncident(incident);
                                setStatusUpdate(incident.status === 'open' ? 'investigating' : 'resolved');
                                setResolutionNotes(incident.resolution_notes || '');
                              }}
                              className="px-2.5 py-1 border border-slate-700 hover:border-cyan-500 bg-[#070B14] text-cyan-400 hover:text-cyan-300 text-[10px] font-bold uppercase rounded transition-all duration-150"
                            >
                              Intervir
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Resolved Incidents History */}
          <div className="border border-[#1E293B] bg-[#080D17]/40 rounded p-6">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-6 flex items-center gap-2">
              <ShieldCheck className="h-4.5 w-4.5 text-slate-500" />
              <span>Arquivo de Ameaças Resolvidas ({resolvedIncidents.length})</span>
            </h3>

            <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
              {resolvedIncidents.length === 0 ? (
                <div className="text-center py-6 text-slate-600 text-xs font-bold uppercase">
                  Nenhum arquivo de incidente disponível
                </div>
              ) : (
                resolvedIncidents.map((incident) => {
                  const agentName = agents.find((a) => a.id === incident.agent_id)?.name || 'Todos / Geral';

                  return (
                    <div key={incident.id} className="border border-slate-900 bg-[#060912] p-4 rounded text-xs">
                      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                        <div className="flex items-center gap-2 text-[10px]">
                          <span className="text-slate-500 font-semibold uppercase">@{agentName}</span>
                          <span className="text-slate-700">|</span>
                          <span className="text-slate-200 font-bold uppercase">{incident.title}</span>
                        </div>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border border-emerald-950 bg-emerald-950/20 text-emerald-400 uppercase">
                          RESOLVED
                        </span>
                      </div>
                      <p className="text-slate-400 text-[10px] mb-2 leading-relaxed">{incident.description}</p>
                      {incident.resolution_notes && (
                        <div className="border-t border-slate-900 pt-2 text-[10px] text-emerald-400">
                          <span className="font-bold uppercase block text-[8px] text-slate-500">Notas de Resolução:</span>
                          <span className="font-mono">{incident.resolution_notes}</span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Dynamic Action Panel for Selected Incident */}
        <div className="space-y-6">
          <div className="border border-[#1E293B] bg-[#080D17]/80 rounded p-6 relative">
            <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-cyan-500"></div>

            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-300 mb-6 flex items-center gap-2">
              <FileText className="h-4.5 w-4.5 text-cyan-400" />
              <span>Gabinete de Resolução</span>
            </h3>

            {selectedIncident ? (
              <form onSubmit={handleUpdateIncidentStatus} className="space-y-5">
                <div className="border border-slate-800 bg-[#05070C] p-4 rounded text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-300 uppercase truncate max-w-[150px]">{selectedIncident.title}</span>
                    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase ${getSeverityBadge(selectedIncident.severity)}`}>
                      {selectedIncident.severity}
                    </span>
                  </div>
                  <p className="text-slate-500 text-[10px] font-mono leading-normal">{selectedIncident.description}</p>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5 tracking-wider">
                    Atualizar Estado Operacional
                  </label>
                  <select
                    value={statusUpdate}
                    onChange={(e) => setStatusUpdate(e.target.value as any)}
                    className="w-full bg-[#05070C] border border-[#1E293B] px-3 py-2 rounded text-xs text-slate-300 focus:outline-none focus:border-cyan-500 cursor-pointer"
                  >
                    <option value="investigating">Investigando (Alerta Amarelo)</option>
                    <option value="resolved">Resolvido (Retorno ao Normal)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5 tracking-wider">
                    Notas de Intervenção / Resolução *
                  </label>
                  <textarea
                    required
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    placeholder="Descreva as ações de remediação adotadas pela equipe do Aegis..."
                    rows={4}
                    className="w-full bg-[#05070C] border border-[#1E293B] px-3 py-2 rounded text-xs text-slate-300 font-mono focus:outline-none focus:border-cyan-500 resize-none"
                  />
                </div>

                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedIncident(null);
                      setResolutionNotes('');
                    }}
                    className="flex-1 py-2 border border-[#1E293B] text-slate-300 text-xs font-bold uppercase rounded transition-all duration-150 hover:bg-slate-900"
                  >
                    Sair
                  </button>
                  <button
                    type="submit"
                    disabled={resolveLoading}
                    className="flex-1 flex items-center justify-center gap-1 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs uppercase tracking-widest rounded transition-all duration-150 shadow-[0_0_12px_rgba(34,211,238,0.2)] disabled:opacity-50"
                  >
                    {resolveLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <span>CONCLUIR</span>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              <div className="h-48 flex flex-col items-center justify-center border border-dashed border-slate-800 rounded text-slate-600 text-[10px] uppercase font-bold tracking-wider px-4 text-center">
                <span>Selecione um incidente ativo para intervir ou modificar seu estado de investigação</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Report Incident Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="relative w-full max-w-lg border border-[#1E293B] bg-[#0A0F1D] rounded shadow-2xl p-6 font-mono">
            {/* Red Accent for alarm/warning */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-red-500"></div>

            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-bold uppercase tracking-widest text-[#F3F4F6] flex items-center gap-2">
                <AlertTriangle className="h-4.5 w-4.5 text-red-500" />
                <span>Registrar Incidente de Segurança (Manual)</span>
              </h3>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-500 hover:text-slate-200 hover:bg-slate-800/40 p-1 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateIncident} className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5 tracking-wider">
                  Título do Alerta / Incidente *
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ex: Vazamento de chaves de API na requisição HTTP"
                  className="w-full bg-[#05070C] border border-[#1E293B] px-3 py-2 rounded text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5 tracking-wider">
                  Detalhamento / Descrição da Ameaça
                </label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Descreva o comportamento suspeito detectado ou anomalia estrutural..."
                  rows={3}
                  className="w-full bg-[#05070C] border border-[#1E293B] px-3 py-2 rounded text-xs text-slate-200 focus:outline-none focus:border-cyan-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5 tracking-wider">
                    Agente Relacionado
                  </label>
                  <select
                    value={newAgent}
                    onChange={(e) => setNewAgent(e.target.value)}
                    className="w-full bg-[#05070C] border border-[#1E293B] px-3 py-2 rounded text-xs text-slate-300 focus:outline-none focus:border-cyan-500 cursor-pointer"
                  >
                    <option value="">Geral (Todos os Sistemas)</option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5 tracking-wider">
                    Nível de Severidade
                  </label>
                  <select
                    value={newSeverity}
                    onChange={(e) => setNewSeverity(e.target.value as any)}
                    className="w-full bg-[#05070C] border border-[#1E293B] px-3 py-2 rounded text-xs text-slate-300 focus:outline-none focus:border-cyan-500 cursor-pointer"
                  >
                    <option value="low">Baixa (Low)</option>
                    <option value="medium">Média (Medium)</option>
                    <option value="high">Alta (High)</option>
                    <option value="critical">Crítica (Critical - RED alert)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5 tracking-wider">
                  Método de Detecção
                </label>
                <select
                  value={newDetectedBy}
                  onChange={(e) => setNewDetectedBy(e.target.value as any)}
                  className="w-full bg-[#05070C] border border-[#1E293B] px-3 py-2 rounded text-xs text-slate-300 focus:outline-none focus:border-cyan-500 cursor-pointer"
                >
                  <option value="manual">Manual (Operador Aegis)</option>
                  <option value="automatic">Automática (Antivírus/SOC)</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4 border-t border-[#1E293B] justify-end">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 border border-[#1E293B] hover:border-slate-500 text-slate-300 rounded text-[11px] font-bold uppercase tracking-wider transition-all duration-150"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitLoading}
                  className="flex items-center gap-1.5 px-5 py-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white rounded text-[11px] font-bold uppercase tracking-widest transition-all duration-150 shadow-[0_0_15px_rgba(239,68,68,0.25)]"
                >
                  {submitLoading ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>DISPATCHING...</span>
                    </>
                  ) : (
                    <span>LAUNCH ALERT</span>
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
