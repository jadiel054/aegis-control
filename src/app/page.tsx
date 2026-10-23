'use client';

import React, { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import {
  Server,
  Activity,
  ShieldAlert,
  ListTodo,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Cpu,
  Bot,
} from 'lucide-react';
import Link from 'next/link';

interface Agent {
  id: string;
  name: string;
  role: string;
  status: string;
  agent_type: string;
  webhook_url: string | null;
  has_telegram_token?: boolean;
  last_heartbeat: string | null;
  created_at: string;
}

export default function OverviewPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [taskStats, setTaskStats] = useState({ total: 0, active: 0, pending: 0, done: 0, failed: 0 });
  const [incidentStats, setIncidentStats] = useState({ open: 0, critical: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timeNow, setTimeNow] = useState(new Date());

  const fetchData = useCallback(async () => {
    try {
      const [agentsRes, tasksRes, incidentsRes] = await Promise.all([
        fetch('/api/agents').then((r) => r.json()),
        fetch('/api/tasks').then((r) => r.json()),
        fetch('/api/incidents').then((r) => r.json()),
      ]);

      if (agentsRes.agents) setAgents(agentsRes.agents);

      if (tasksRes.tasks) {
        const tasks = tasksRes.tasks;
        setTaskStats({
          total: tasks.length,
          active: tasks.filter((t: any) => t.status === 'in_progress').length,
          pending: tasks.filter((t: any) => t.status === 'pending').length,
          done: tasks.filter((t: any) => t.status === 'done').length,
          failed: tasks.filter((t: any) => t.status === 'failed').length,
        });
      }

      if (incidentsRes.incidents) {
        const incidents = incidentsRes.incidents;
        const open = incidents.filter((i: any) => i.status === 'open' || i.status === 'investigating');
        setIncidentStats({
          open: open.length,
          critical: open.filter((i: any) => i.severity === 'critical').length,
        });
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const timeInterval = setInterval(() => setTimeNow(new Date()), 5000);
    const pollInterval = setInterval(fetchData, 10000); // poll every 10s
    return () => {
      clearInterval(timeInterval);
      clearInterval(pollInterval);
    };
  }, [fetchData]);

  const isAgentOnline = (agent: Agent) => {
    if (!agent.last_heartbeat) return false;
    const lastHB = new Date(agent.last_heartbeat);
    const diffMs = timeNow.getTime() - lastHB.getTime();
    return diffMs < 90000 && agent.status === 'online';
  };

  const getAgentStatusColor = (agent: Agent) => {
    if (agent.status === 'error') return 'border-red-500 bg-red-950/20 text-red-400';
    if (isAgentOnline(agent)) return 'border-emerald-500 bg-emerald-950/20 text-emerald-400';
    return 'border-slate-800 bg-slate-950/40 text-slate-400';
  };

  const getAgentStatusDot = (agent: Agent) => {
    if (agent.status === 'error') return 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.7)]';
    if (isAgentOnline(agent)) return 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)] animate-pulse';
    return 'bg-slate-600';
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex h-64 items-center justify-center text-xs text-cyan-400">
          <RefreshCw className="h-4 w-4 animate-spin mr-2" />
          <span>SYNCHRONIZING NEON COMMAND MATRIX...</span>
        </div>
      </DashboardLayout>
    );
  }

  const onlineCount = agents.filter(isAgentOnline).length;

  return (
    <DashboardLayout>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-xl font-bold tracking-widest text-[#F3F4F6] uppercase">CENTRAL DE MONITORAMENTO</h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">Aegis SOC · Neon Real-Time Overview</p>
        </div>
        <button
          onClick={() => {
            setRefreshing(true);
            fetchData();
          }}
          disabled={refreshing}
          className="self-start flex items-center gap-2 px-3.5 py-2 border border-[#1E293B] bg-[#0C1322] hover:bg-[#121A2E] text-slate-300 text-xs font-bold uppercase tracking-widest rounded transition-all duration-150 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          <span>{refreshing ? 'REFRESHING' : 'FORCE REFRESH'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="border border-[#1E293B] bg-[#080D17]/80 p-5 rounded relative overflow-hidden">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Sistemas Conectados</p>
          <p className="text-3xl font-extrabold text-[#F3F4F6] mt-2 tracking-tight">
            {onlineCount}
            <span className="text-xs text-slate-600 font-normal ml-1">/ {agents.length} AGENTES</span>
          </p>
          <p className="text-[10px] text-emerald-400/80 uppercase tracking-wider mt-3 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Polling Neon 10s
          </p>
        </div>

        <div className="border border-[#1E293B] bg-[#080D17]/80 p-5 rounded">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Tarefas em Progresso</p>
          <p className="text-3xl font-extrabold text-[#F3F4F6] mt-2">
            {taskStats.active}
            <span className="text-xs text-slate-600 font-normal ml-1">/ {taskStats.total}</span>
          </p>
          <p className="text-[10px] text-amber-500/80 uppercase tracking-wider mt-3">{taskStats.pending} pendentes</p>
        </div>

        <div className="border border-red-900/30 bg-[#080D17]/80 p-5 rounded">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Incidentes de Segurança</p>
          <p className={`text-3xl font-extrabold mt-2 ${incidentStats.open > 0 ? 'text-red-400' : 'text-[#F3F4F6]'}`}>
            {incidentStats.open}
            <span className="text-xs text-slate-600 font-normal ml-1">ATIVOS</span>
          </p>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-3">{incidentStats.critical} críticos</p>
        </div>

        <div className="border border-[#1E293B] bg-[#080D17]/80 p-5 rounded">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Concluídas / Falhas</p>
          <p className="text-3xl font-extrabold text-[#F3F4F6] mt-2">{taskStats.done}</p>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-3">{taskStats.failed} falhas</p>
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-xs uppercase tracking-widest font-bold text-slate-400 mb-4 flex items-center gap-2">
          <Server className="h-4 w-4 text-cyan-400" />
          <span>Matriz de Agentes</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {agents.map((agent) => {
            const online = isAgentOnline(agent);
            return (
              <div key={agent.id} className={`border rounded flex flex-col justify-between p-5 transition-all ${getAgentStatusColor(agent)}`}>
                <div>
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div>
                      <h3 className="text-sm font-extrabold text-[#F3F4F6] uppercase tracking-wide flex items-center gap-2">
                        {agent.agent_type === 'telegram_bot' && <Bot className="h-3.5 w-3.5" />}
                        {agent.name}
                      </h3>
                      <span className="text-[10px] text-slate-500 uppercase font-semibold tracking-widest">
                        {agent.role} · {agent.agent_type}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 px-2 py-1 rounded border border-slate-800 bg-[#070B14] text-[10px] uppercase font-bold">
                      <span className={`h-2 w-2 rounded-full ${getAgentStatusDot(agent)}`} />
                      <span>{agent.status === 'error' ? 'ERROR' : online ? 'ONLINE' : 'OFFLINE'}</span>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs border-t border-[#1E293B]/60 pt-3">
                    <div className="flex justify-between">
                      <span className="text-slate-500 uppercase text-[10px]">Webhook</span>
                      {agent.webhook_url ? (
                        <a href={agent.webhook_url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline inline-flex items-center gap-1 text-[11px]">
                          link <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-slate-600 text-[11px]">—</span>
                      )}
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 uppercase text-[10px]">Telegram</span>
                      <span className="text-[11px]">{agent.has_telegram_token ? 'token ok' : '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 uppercase text-[10px]">Último heartbeat</span>
                      <span className="text-slate-300 font-semibold text-[11px]">
                        {agent.last_heartbeat ? new Date(agent.last_heartbeat).toLocaleTimeString() : 'NEVER'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-[#1E293B]/60 flex gap-2">
                  <Link href="/commands" className="flex-1 text-center border border-[#1E293B] hover:border-cyan-500 bg-[#070A14] text-slate-300 hover:text-cyan-400 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider">
                    Comando
                  </Link>
                  <Link href="/tests" className="flex-1 text-center border border-[#1E293B] hover:border-cyan-500 bg-[#070A14] text-slate-300 hover:text-cyan-400 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider">
                    Teste
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="border border-[#1E293B] bg-[#070B13]/90 rounded p-6">
        <h3 className="text-xs uppercase font-bold text-slate-400 tracking-widest mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4 text-cyan-400" />
          <span>Console Central · Neon</span>
        </h3>
        <p className="text-xs text-slate-500 leading-relaxed uppercase">
          Backend migrado para Neon Postgres. Heartbeats, comandos e mensagens via Agent SDK.
          Polling a cada 10s. Supabase desvinculado.
        </p>
      </div>
    </DashboardLayout>
  );
}
