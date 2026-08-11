'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { supabase } from '@/lib/supabaseClient';
import {
  Terminal,
  RefreshCw,
  Send,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  ShieldAlert
} from 'lucide-react';

interface Agent {
  id: string;
  name: string;
  status: string;
}

interface Command {
  id: string;
  agent_id: string;
  command_type: 'restart' | 'redeploy' | 'run_diagnostic' | 'custom';
  payload: any;
  status: 'pending' | 'sent' | 'acknowledged' | 'failed';
  issued_by: string;
  created_at: string;
  executed_at: string | null;
}

export default function CommandsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [commands, setCommands] = useState<Command[]>([]);
  const [loading, setLoading] = useState(true);

  // Command form state
  const [selectedAgent, setSelectedAgent] = useState('');
  const [selectedType, setSelectedType] = useState<'restart' | 'redeploy' | 'run_diagnostic' | 'custom'>('restart');
  const [customPayload, setCustomPayload] = useState('');
  const [issuedBy, setIssuedBy] = useState('Operator');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [formFeedback, setFormFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const fetchData = async () => {
    try {
      const { data: agentsData } = await supabase.from('agents').select('id, name, status').order('name');
      const { data: commandsData } = await supabase
        .from('commands')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(40);

      if (agentsData) {
        setAgents(agentsData);
        if (agentsData.length > 0 && !selectedAgent) {
          setSelectedAgent(agentsData[0].id);
        }
      }
      if (commandsData) setCommands(commandsData as Command[]);
    } catch (err) {
      console.error('Error fetching commands data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Subscribe to realtime command updates
    const commandsChannel = supabase
      .channel('commands-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'commands' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setCommands((prev) => [payload.new as Command, ...prev.slice(0, 39)]);
          } else if (payload.eventType === 'UPDATE') {
            setCommands((prev) =>
              prev.map((c) => (c.id === (payload.new as Command).id ? (payload.new as Command) : c))
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(commandsChannel);
    };
  }, []);

  const handleSendCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgent || !selectedType) return;

    setSubmitLoading(true);
    setFormFeedback(null);

    let parsedPayload = {};
    if (selectedType === 'custom' && customPayload) {
      try {
        parsedPayload = JSON.parse(customPayload);
      } catch (err) {
        setFormFeedback({ type: 'error', msg: 'Payload JSON inválido. Digite um formato JSON válido.' });
        setSubmitLoading(false);
        return;
      }
    }

    try {
      const response = await fetch('/api/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: selectedAgent,
          command_type: selectedType,
          payload: parsedPayload,
          issued_by: issuedBy || 'Operator',
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setFormFeedback({
          type: 'success',
          msg: `Comando '${selectedType.toUpperCase()}' enviado com status final: ${data.command.status.toUpperCase()}`,
        });
        setCustomPayload('');
      } else {
        setFormFeedback({
          type: 'error',
          msg: data.error || 'Erro ao despachar comando.',
        });
      }
    } catch (error: any) {
      setFormFeedback({ type: 'error', msg: `Erro de rede: ${error.message}` });
    } finally {
      setSubmitLoading(false);
    }
  };

  const triggerQuickAction = async (agentId: string, type: Command['command_type']) => {
    setFormFeedback(null);
    try {
      const response = await fetch('/api/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agentId,
          command_type: type,
          payload: { quick_action: true },
          issued_by: issuedBy || 'Operator (Quick)',
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Find agent name for the alert
        const name = agents.find((a) => a.id === agentId)?.name || 'Agente';
        alert(`Sucesso! Comando '${type.toUpperCase()}' despachado para ${name}. Status: ${data.command.status.toUpperCase()}`);
      } else {
        alert(`Falha: ${data.error || 'Erro ao despachar'}`);
      }
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    }
  };

  const getStatusBadge = (status: Command['status']) => {
    switch (status) {
      case 'acknowledged':
        return 'text-emerald-400 border-emerald-500/20 bg-emerald-950/10';
      case 'sent':
        return 'text-blue-400 border-blue-500/20 bg-blue-950/10';
      case 'pending':
        return 'text-amber-400 border-amber-500/20 bg-amber-950/10';
      case 'failed':
        return 'text-red-400 border-red-500/20 bg-red-950/10';
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
      {/* Title */}
      <div className="mb-8">
        <h1 className="text-xl font-bold tracking-widest text-[#F3F4F6] uppercase">PAINEL DE COMANDOS</h1>
        <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">
          Direct dispatch of remote system operations & diagnostic routines
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left column: Quick Commands Form */}
        <div className="space-y-6 lg:col-span-1">
          {/* Dispatch console form */}
          <div className="border border-[#1E293B] bg-[#080D17]/80 rounded p-6 relative">
            <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-blue-500 to-indigo-500"></div>

            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-300 mb-6 flex items-center gap-2">
              <Terminal className="h-4 w-4 text-cyan-400" />
              <span>Despachar Comando Remoto</span>
            </h3>

            {formFeedback && (
              <div
                className={`mb-5 p-4 rounded text-xs border uppercase font-mono flex items-start gap-2.5 ${
                  formFeedback.type === 'success'
                    ? 'border-emerald-900 bg-emerald-950/20 text-emerald-400'
                    : 'border-red-900 bg-red-950/20 text-red-400'
                }`}
              >
                {formFeedback.type === 'success' ? (
                  <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500 shrink-0" />
                ) : (
                  <XCircle className="h-4.5 w-4.5 text-red-500 shrink-0" />
                )}
                <span>{formFeedback.msg}</span>
              </div>
            )}

            <form onSubmit={handleSendCommand} className="space-y-5">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5 tracking-wider">
                  Selecionar Agente de IA
                </label>
                <select
                  value={selectedAgent}
                  onChange={(e) => setSelectedAgent(e.target.value)}
                  className="w-full bg-[#05070C] border border-[#1E293B] px-3 py-2.5 rounded text-xs text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
                >
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name} ({agent.status.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5 tracking-wider">
                  Tipo de Instrução (Command)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'restart', name: 'Restart' },
                    { id: 'redeploy', name: 'Redeploy' },
                    { id: 'run_diagnostic', name: 'Diagnostic' },
                    { id: 'custom', name: 'Custom' },
                  ].map((type) => (
                    <button
                      type="button"
                      key={type.id}
                      onClick={() => setSelectedType(type.id as any)}
                      className={`py-2 px-3 border rounded text-xs font-bold uppercase transition-all duration-150 ${
                        selectedType === type.id
                          ? 'border-cyan-500 bg-cyan-950/20 text-cyan-400 shadow-[inset_0_0_8px_rgba(6,182,212,0.1)]'
                          : 'border-[#1E293B] bg-[#05070C] hover:border-slate-600 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {type.name}
                    </button>
                  ))}
                </div>
              </div>

              {selectedType === 'custom' && (
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5 tracking-wider">
                    Payload Customizado (JSON)
                  </label>
                  <textarea
                    value={customPayload}
                    onChange={(e) => setCustomPayload(e.target.value)}
                    placeholder='{ "force": true, "env": "production" }'
                    rows={4}
                    className="w-full bg-[#05070C] border border-[#1E293B] p-3 rounded text-xs text-slate-300 font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5 tracking-wider">
                  Assinado por (Operator)
                </label>
                <input
                  type="text"
                  required
                  value={issuedBy}
                  onChange={(e) => setIssuedBy(e.target.value)}
                  className="w-full bg-[#05070C] border border-[#1E293B] px-3 py-2 rounded text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <button
                type="submit"
                disabled={submitLoading || !selectedAgent}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs uppercase tracking-widest rounded transition-all duration-150 shadow-[0_0_12px_rgba(34,211,238,0.2)] disabled:opacity-50"
              >
                {submitLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>TRANSMITTING...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    <span>TRANSMIT COMMAND</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Quick Actions Panel */}
          <div className="border border-[#1E293B] bg-[#080D17]/80 rounded p-6">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-300 mb-4">
              Ações Rápidas por Agente
            </h3>
            <div className="space-y-4">
              {agents.map((agent) => (
                <div key={agent.id} className="border border-slate-800 bg-[#05070C] p-3 rounded flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300 uppercase">{agent.name}</span>
                    <span className="text-[9px] text-slate-500 font-mono">Quick Fire</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      onClick={() => triggerQuickAction(agent.id, 'restart')}
                      className="border border-[#1E293B] hover:border-amber-500 bg-[#070A14] text-[9px] font-bold py-1 px-2 rounded uppercase text-slate-400 hover:text-amber-400"
                    >
                      Restart
                    </button>
                    <button
                      onClick={() => triggerQuickAction(agent.id, 'redeploy')}
                      className="border border-[#1E293B] hover:border-cyan-500 bg-[#070A14] text-[9px] font-bold py-1 px-2 rounded uppercase text-slate-400 hover:text-cyan-400"
                    >
                      Redeploy
                    </button>
                    <button
                      onClick={() => triggerQuickAction(agent.id, 'run_diagnostic')}
                      className="border border-[#1E293B] hover:border-emerald-500 bg-[#070A14] text-[9px] font-bold py-1 px-2 rounded uppercase text-slate-400 hover:text-emerald-400"
                    >
                      Diagnose
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column: Recent Commands History */}
        <div className="lg:col-span-2 border border-[#1E293B] bg-[#080D17]/60 rounded p-6 flex flex-col h-[80vh]">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-300 mb-6 flex items-center gap-2">
            <Clock className="h-4.5 w-4.5 text-cyan-400" />
            <span>Histórico de Comandos Enviados</span>
          </h3>

          <div className="flex-1 overflow-y-auto space-y-3.5 pr-1">
            {commands.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-slate-600 text-xs uppercase font-bold border border-dashed border-slate-800 rounded">
                Sem comandos no registro operacional
              </div>
            ) : (
              commands.map((cmd) => {
                const agentName = agents.find((a) => a.id === cmd.agent_id)?.name || 'Desconhecido';

                return (
                  <div
                    key={cmd.id}
                    className="border border-[#1E293B]/70 bg-[#060912] p-4 rounded flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-slate-800 transition-all duration-150 font-mono"
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="text-xs font-extrabold text-slate-200 uppercase">
                          @{agentName}
                        </span>
                        <span className="text-slate-600 text-xs">|</span>
                        <span className="text-cyan-400 text-xs font-bold uppercase">
                          {cmd.command_type.toUpperCase()}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          by {cmd.issued_by}
                        </span>
                      </div>

                      {cmd.payload && Object.keys(cmd.payload).length > 0 && (
                        <pre className="text-[9px] text-slate-500 bg-[#030509] p-2 rounded overflow-x-auto border border-slate-900/40">
                          {JSON.stringify(cmd.payload, null, 2)}
                        </pre>
                      )}

                      <div className="text-[9px] text-slate-500 flex items-center gap-2">
                        <span>Lançado em: {new Date(cmd.created_at).toLocaleTimeString()}</span>
                        {cmd.executed_at && (
                          <>
                            <span>•</span>
                            <span>Executado em: {new Date(cmd.executed_at).toLocaleTimeString()}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0">
                      <span
                        className={`text-[10px] font-extrabold tracking-widest px-2.5 py-1 rounded border uppercase ${getStatusBadge(
                          cmd.status
                        )}`}
                      >
                        {cmd.status}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
