'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { supabase } from '@/lib/supabaseClient';
import {
  Server,
  Activity,
  ShieldAlert,
  ListTodo,
  CheckCircle2,
  Clock,
  ExternalLink,
  RefreshCw,
  Cpu
} from 'lucide-react';
import Link from 'next/link';

interface Agent {
  id: string;
  name: string;
  role: string;
  status: string;
  webhook_url: string;
  last_heartbeat: string | null;
  created_at: string;
}

interface Task {
  id: string;
  status: string;
}

interface Incident {
  id: string;
  status: string;
  severity: string;
}

export default function OverviewPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timeNow, setTimeNow] = useState(new Date());

  // Fetch initial data
  const fetchData = async () => {
    try {
      const { data: agentsData, error: agentsError } = await supabase
        .from('agents')
        .select('*')
        .order('name');

      const { data: tasksData, error: tasksError } = await supabase
        .from('tasks')
        .select('id, status');

      const { data: incidentsData, error: incidentsError } = await supabase
        .from('security_incidents')
        .select('id, status, severity');

      if (!agentsError && agentsData) setAgents(agentsData);
      if (!tasksError && tasksData) setTasks(tasksData);
      if (!incidentsError && incidentsData) setIncidents(incidentsData);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Set interval to update time comparison
    const timeInterval = setInterval(() => {
      setTimeNow(new Date());
    }, 5000);

    // Subscribe to realtime updates for agents
    const agentsChannel = supabase
      .channel('agents-overview')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'agents' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setAgents((prev) => [...prev, payload.new as Agent].sort((a, b) => a.name.localeCompare(b.name)));
          } else if (payload.eventType === 'UPDATE') {
            setAgents((prev) =>
              prev.map((a) => (a.id === (payload.new as Agent).id ? (payload.new as Agent) : a))
            );
          } else if (payload.eventType === 'DELETE') {
            setAgents((prev) => prev.filter((a) => a.id !== (payload.old as any).id));
          }
        }
      )
      .subscribe();

    // Subscribe to realtime updates for tasks
    const tasksChannel = supabase
      .channel('tasks-overview')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        () => {
          // Re-fetch count data
          supabase.from('tasks').select('id, status').then(({ data }) => {
            if (data) setTasks(data);
          });
        }
      )
      .subscribe();

    // Subscribe to realtime updates for security incidents
    const incidentsChannel = supabase
      .channel('incidents-overview')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'security_incidents' },
        () => {
          supabase.from('security_incidents').select('id, status, severity').then(({ data }) => {
            if (data) setIncidents(data);
          });
        }
      )
      .subscribe();

    return () => {
      clearInterval(timeInterval);
      supabase.removeChannel(agentsChannel);
      supabase.removeChannel(tasksChannel);
      supabase.removeChannel(incidentsChannel);
    };
  }, []);

  const handleManualRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // Helper to determine if agent is actually online (heartbeat < 60 seconds)
  const isAgentOnline = (agent: Agent) => {
    if (!agent.last_heartbeat) return false;
    const lastHB = new Date(agent.last_heartbeat);
    const diffMs = timeNow.getTime() - lastHB.getTime();
    return diffMs < 60000 && agent.status === 'online'; // 60 seconds threshold
  };

  const getAgentStatusColor = (agent: Agent) => {
    if (agent.status === 'error') return 'border-red-500 bg-red-950/20 text-red-400';
    const online = isAgentOnline(agent);
    if (online) return 'border-emerald-500 bg-emerald-950/20 text-emerald-400';
    return 'border-slate-800 bg-slate-950/40 text-slate-400';
  };

  const getAgentStatusDot = (agent: Agent) => {
    if (agent.status === 'error') return 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.7)]';
    const online = isAgentOnline(agent);
    if (online) return 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)] animate-pulse';
    return 'bg-slate-600';
  };

  // Metric computations
  const totalTasks = tasks.length;
  const activeTasks = tasks.filter((t) => t.status === 'in_progress').length;
  const pendingTasks = tasks.filter((t) => t.status === 'pending').length;
  const completedTasks = tasks.filter((t) => t.status === 'done').length;
  const failedTasks = tasks.filter((t) => t.status === 'failed').length;

  const openIncidents = incidents.filter((i) => i.status === 'open' || i.status === 'investigating').length;
  const criticalIncidents = incidents.filter(
    (i) => (i.status === 'open' || i.status === 'investigating') && i.severity === 'critical'
  ).length;

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex h-64 items-center justify-center text-xs text-cyan-400">
          <RefreshCw className="h-4 w-4 animate-spin mr-2" />
          <span>SYNCHRONIZING SECURE COMMAND MATRIX...</span>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      {/* Title & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-xl font-bold tracking-widest text-[#F3F4F6] uppercase">CENTRAL DE MONITORAMENTO</h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">Aegis SOC Real-Time Overview & Metrics</p>
        </div>
        <button
          onClick={handleManualRefresh}
          disabled={refreshing}
          className="self-start flex items-center gap-2 px-3.5 py-2 border border-[#1E293B] bg-[#0C1322] hover:bg-[#121A2E] text-slate-300 text-xs font-bold uppercase tracking-widest rounded transition-all duration-150 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          <span>{refreshing ? 'REFRESHING' : 'FORCE REFRESH'}</span>
        </button>
      </div>

      {/* Counters Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* Metric 1 */}
        <div className="border border-[#1E293B] bg-[#080D17]/80 p-5 rounded relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 text-slate-800 group-hover:text-cyan-950/20 transition-all duration-300">
            <Cpu className="h-16 w-16 -mt-3 -mr-3" />
          </div>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Sistemas Conectados</p>
          <p className="text-3xl font-extrabold text-[#F3F4F6] mt-2 tracking-tight">
            {agents.filter((a) => isAgentOnline(a)).length}
            <span className="text-xs text-slate-600 font-normal ml-1">/ {agents.length} AGENTES</span>
          </p>
          <p className="text-[10px] text-emerald-400/80 uppercase tracking-wider mt-3 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
            Jarvis, Morpheus & Zarith
          </p>
        </div>

        {/* Metric 2 */}
        <div className="border border-[#1E293B] bg-[#080D17]/80 p-5 rounded relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 text-slate-800 group-hover:text-blue-950/20 transition-all duration-300">
            <ListTodo className="h-16 w-16 -mt-3 -mr-3" />
          </div>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Tarefas em Progresso</p>
          <p className="text-3xl font-extrabold text-[#F3F4F6] mt-2 tracking-tight">
            {activeTasks}
            <span className="text-xs text-slate-600 font-normal ml-1">/ {totalTasks} TOTAL</span>
          </p>
          <p className="text-[10px] text-amber-500/80 uppercase tracking-wider mt-3 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
            {pendingTasks} pendentes
          </p>
        </div>

        {/* Metric 3 */}
        <div className="border border-red-900/30 bg-[#080D17]/80 p-5 rounded relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 text-slate-800 group-hover:text-red-950/20 transition-all duration-300">
            <ShieldAlert className="h-16 w-16 -mt-3 -mr-3" />
          </div>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Incidentes de Segurança</p>
          <p className={`text-3xl font-extrabold mt-2 tracking-tight ${openIncidents > 0 ? 'text-red-400' : 'text-[#F3F4F6]'}`}>
            {openIncidents}
            <span className="text-xs text-slate-600 font-normal ml-1">ATIVOS</span>
          </p>
          <p className={`text-[10px] uppercase tracking-wider mt-3 flex items-center gap-1.5 ${criticalIncidents > 0 ? 'text-red-500 animate-pulse font-bold' : 'text-slate-500'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${criticalIncidents > 0 ? 'bg-red-500' : 'bg-slate-600'}`}></span>
            {criticalIncidents} críticos requerem atenção
          </p>
        </div>

        {/* Metric 4 */}
        <div className="border border-[#1E293B] bg-[#080D17]/80 p-5 rounded relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 text-slate-800 group-hover:text-emerald-950/20 transition-all duration-300">
            <CheckCircle2 className="h-16 w-16 -mt-3 -mr-3" />
          </div>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Sucesso de Diagnósticos</p>
          <p className="text-3xl font-extrabold text-[#F3F4F6] mt-2 tracking-tight">
            {completedTasks}
            <span className="text-xs text-slate-600 font-normal ml-1">CONCLUÍDAS</span>
          </p>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-3 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500"></span>
            {failedTasks} falhas registradas
          </p>
        </div>
      </div>

      {/* Agents Status Cards */}
      <div className="mb-8">
        <h2 className="text-xs uppercase tracking-widest font-bold text-slate-400 mb-4 flex items-center gap-2">
          <Server className="h-4 w-4 text-cyan-400" />
          <span>Matriz de Agentes de IA</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {agents.map((agent) => {
            const online = isAgentOnline(agent);
            const statusStyle = getAgentStatusColor(agent);
            const dotStyle = getAgentStatusDot(agent);

            return (
              <div
                key={agent.id}
                className={`border rounded flex flex-col justify-between p-6 transition-all duration-150 ${statusStyle}`}
              >
                <div>
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div>
                      <h3 className="text-base font-extrabold text-[#F3F4F6] uppercase tracking-wide">
                        {agent.name}
                      </h3>
                      <span className="text-[10px] text-slate-500 uppercase font-semibold tracking-widest">
                        Role: {agent.role}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 px-2.5 py-1 rounded border border-slate-800 bg-[#070B14] text-[10px] uppercase font-bold tracking-wider">
                      <span className={`h-2 w-2 rounded-full ${dotStyle}`}></span>
                      <span>{agent.status === 'error' ? 'ERROR' : online ? 'ONLINE' : 'OFFLINE'}</span>
                    </div>
                  </div>

                  {/* Metadata fields */}
                  <div className="space-y-3 text-xs border-t border-[#1E293B]/60 pt-4">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 uppercase text-[10px]">Webhook URL</span>
                      <a
                        href={agent.webhook_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-400 hover:underline truncate max-w-[150px] inline-flex items-center gap-1 text-[11px]"
                        title={agent.webhook_url}
                      >
                        <span>Webhook</span>
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 uppercase text-[10px]">Último Pulso (Heartbeat)</span>
                      <span className="text-slate-300 font-semibold text-[11px]">
                        {agent.last_heartbeat
                          ? new Date(agent.last_heartbeat).toLocaleTimeString()
                          : 'NEVER'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 uppercase text-[10px]">Latência do Sistema</span>
                      <span className={`font-semibold text-[11px] ${online ? 'text-emerald-400' : 'text-slate-500'}`}>
                        {online ? 'LIVESTREAM OK' : 'NO_SIGNAL'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Quick Actions */}
                <div className="mt-6 pt-4 border-t border-[#1E293B]/60 flex gap-2">
                  <Link
                    href="/commands"
                    className="flex-1 text-center border border-[#1E293B] hover:border-cyan-500 bg-[#070A14] text-slate-300 hover:text-cyan-400 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all duration-150"
                  >
                    Enviar Comando
                  </Link>
                  <Link
                    href="/tests"
                    className="flex-1 text-center border border-[#1E293B] hover:border-cyan-500 bg-[#070A14] text-slate-300 hover:text-cyan-400 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all duration-150"
                  >
                    Rodar Teste
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Realtime Alert Board */}
      <div className="border border-[#1E293B] bg-[#070B13]/90 rounded p-6">
        <h3 className="text-xs uppercase font-bold text-slate-400 tracking-widest mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4 text-cyan-400" />
          <span>Console de Monitoramento Central</span>
        </h3>
        <p className="text-xs text-slate-500 leading-relaxed uppercase">
          Todos os canais de comunicação com Jarvis, Morpheus e Zarith estão operando sob protocolo TLS 1.3 de ponta a ponta.
          Use o menu lateral para navegar entre o quadro Kanban de tarefas administrativas, disparar ações remotas, auditar os incidentes críticos de segurança e iniciar testes preventivos de saúde operacional.
        </p>
      </div>
    </DashboardLayout>
  );
}
