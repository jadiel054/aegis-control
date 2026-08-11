'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { supabase } from '@/lib/supabaseClient';
import {
  FlaskConical,
  Play,
  Loader2,
  CheckCircle,
  XCircle,
  Code,
  Clock,
  Terminal,
  Activity
} from 'lucide-react';

interface Agent {
  id: string;
  name: string;
  status: string;
}

interface TestRun {
  id: string;
  agent_id: string;
  test_name: string;
  status: 'running' | 'passed' | 'failed';
  result: any;
  logs: string;
  created_at: string;
}

export default function TestRunnerPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [testRuns, setTestRuns] = useState<TestRun[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [selectedAgent, setSelectedAgent] = useState('');
  const [testSuiteName, setTestSuiteName] = useState('Ping & Webhook Health Diagnostics');
  const [runLoading, setRunLoading] = useState(false);

  // Selected test run for log inspector
  const [inspectingRun, setInspectingRun] = useState<TestRun | null>(null);

  const fetchData = async () => {
    try {
      const { data: agentsData } = await supabase.from('agents').select('id, name, status').order('name');
      const { data: runsData } = await supabase
        .from('test_runs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (agentsData) {
        setAgents(agentsData);
        if (agentsData.length > 0 && !selectedAgent) {
          setSelectedAgent(agentsData[0].id);
        }
      }
      if (runsData) {
        setTestRuns(runsData as TestRun[]);
        if (runsData.length > 0 && !inspectingRun) {
          setInspectingRun(runsData[0] as TestRun);
        }
      }
    } catch (err) {
      console.error('Error fetching test data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Subscribe to test runs changes
    const testRunsChannel = supabase
      .channel('test-runs-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'test_runs' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setTestRuns((prev) => [payload.new as TestRun, ...prev.slice(0, 49)]);
            setInspectingRun(payload.new as TestRun);
          } else if (payload.eventType === 'UPDATE') {
            setTestRuns((prev) =>
              prev.map((r) => (r.id === (payload.new as TestRun).id ? (payload.new as TestRun) : r))
            );
            // If we are currently inspecting this updated run, refresh it
            setInspectingRun((current) =>
              current && current.id === (payload.new as TestRun).id ? (payload.new as TestRun) : current
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(testRunsChannel);
    };
  }, []);

  const handleLaunchTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgent) return;

    setRunLoading(true);
    try {
      const response = await fetch('/api/tests/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: selectedAgent,
          test_name: testSuiteName,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        alert(`Falha ao disparar suite de teste: ${errData.error || 'Erro desconhecido'}`);
      }
    } catch (err: any) {
      alert(`Erro de conexão: ${err.message}`);
    } finally {
      setRunLoading(false);
    }
  };

  const getStatusIcon = (status: TestRun['status']) => {
    switch (status) {
      case 'passed':
        return <CheckCircle className="h-4 w-4 text-emerald-400" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-400" />;
      case 'running':
        return <Loader2 className="h-4 w-4 text-cyan-400 animate-spin" />;
    }
  };

  const getStatusClass = (status: TestRun['status']) => {
    switch (status) {
      case 'passed':
        return 'text-emerald-400 border-emerald-500/20 bg-emerald-950/10';
      case 'failed':
        return 'text-red-400 border-red-500/20 bg-red-950/10';
      case 'running':
        return 'text-cyan-400 border-cyan-500/20 bg-cyan-950/10';
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
        <h1 className="text-xl font-bold tracking-widest text-[#F3F4F6] uppercase">PAINEL DE TESTES INTEGRADOS</h1>
        <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">
          Automated and manual diagnostic testing routines for AI node health
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Left Column: Test Launcher Form & History List */}
        <div className="xl:col-span-1 space-y-6">
          {/* Form */}
          <div className="border border-[#1E293B] bg-[#080D17]/80 rounded p-6 relative">
            <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-cyan-500"></div>

            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-300 mb-6 flex items-center gap-2">
              <FlaskConical className="h-4.5 w-4.5 text-cyan-400" />
              <span>Instanciar Rotina de Teste</span>
            </h3>

            <form onSubmit={handleLaunchTest} className="space-y-5">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5 tracking-wider">
                  Selecionar Nó de IA (Agente)
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
                  Suite de Teste (Diagnostic)
                </label>
                <select
                  value={testSuiteName}
                  onChange={(e) => setTestSuiteName(e.target.value)}
                  className="w-full bg-[#05070C] border border-[#1E293B] px-3 py-2.5 rounded text-xs text-slate-300 focus:outline-none focus:border-cyan-500 cursor-pointer"
                >
                  <option value="Ping & Webhook Health Diagnostics">Ping & Webhook Health Diagnostics</option>
                  <option value="Integrity Validation Matrix (Full)">Integrity Validation Matrix (Full)</option>
                  <option value="Cryptographic Memory Buffer Leak Check">Cryptographic Memory Buffer Leak Check</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={runLoading || !selectedAgent}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs uppercase tracking-widest rounded transition-all duration-150 shadow-[0_0_12px_rgba(34,211,238,0.2)] disabled:opacity-50"
              >
                {runLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>EXECUTANDO DIAGNÓSTICO...</span>
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5" />
                    <span>DISPARAR TESTE AO VIVO</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Test run history */}
          <div className="border border-[#1E293B] bg-[#080D17]/40 rounded p-6">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              <span>Rotinas Executadas Recentes</span>
            </h3>

            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {testRuns.length === 0 ? (
                <div className="text-center py-6 text-slate-600 text-xs font-bold uppercase">
                  Nenhuma rotina executada
                </div>
              ) : (
                testRuns.map((run) => {
                  const agentName = agents.find((a) => a.id === run.agent_id)?.name || 'Agente';
                  const isSelected = inspectingRun && inspectingRun.id === run.id;

                  return (
                    <button
                      key={run.id}
                      onClick={() => setInspectingRun(run)}
                      className={`w-full text-left p-3.5 border rounded flex items-center justify-between gap-3 transition-all duration-150 ${
                        isSelected
                          ? 'border-cyan-500/40 bg-cyan-950/10'
                          : 'border-slate-900 bg-[#060912] hover:bg-[#0C1221]'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-extrabold text-slate-200">@{agentName}</span>
                          <span className="text-slate-700 text-xs">•</span>
                          <span className="text-[10px] text-slate-400 truncate max-w-[120px] font-semibold uppercase">{run.test_name}</span>
                        </div>
                        <span className="text-[9px] text-slate-500">
                          {new Date(run.created_at).toLocaleTimeString()}
                        </span>
                      </div>

                      <div className="shrink-0 flex items-center gap-1.5">
                        <span className={`text-[8px] font-extrabold tracking-widest px-2 py-0.5 rounded border uppercase ${getStatusClass(run.status)}`}>
                          {run.status}
                        </span>
                        {getStatusIcon(run.status)}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Diagnostic Logs / Output Console */}
        <div className="xl:col-span-2 border border-[#1E293B] bg-[#070A14] rounded p-6 flex flex-col h-[80vh]">
          {inspectingRun ? (
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold text-slate-200 uppercase">
                      @{agents.find((a) => a.id === inspectingRun.agent_id)?.name || 'Agente'}
                    </span>
                    <span className="text-slate-600 text-xs">|</span>
                    <h3 className="text-xs font-extrabold text-cyan-400 uppercase tracking-wide">
                      {inspectingRun.test_name}
                    </h3>
                  </div>
                  <div className="text-[9px] text-slate-500 mt-1 uppercase">
                    ID: {inspectingRun.id} • Lançado em: {new Date(inspectingRun.created_at).toLocaleString()}
                  </div>
                </div>

                <span className={`text-[10px] font-bold tracking-widest px-2.5 py-1 rounded border uppercase ${getStatusClass(inspectingRun.status)}`}>
                  {inspectingRun.status.toUpperCase()}
                </span>
              </div>

              {/* Console Logs Terminal */}
              <div className="flex-1 bg-[#04060B] border border-[#1E293B]/40 p-4 rounded font-mono text-[11px] text-slate-300 overflow-y-auto mb-4 space-y-2 max-h-[45vh]">
                <div className="text-[10px] text-slate-500 uppercase pb-2 border-b border-slate-900/60 mb-2 flex items-center gap-2">
                  <Terminal className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Log Operacional Diagnóstico</span>
                </div>
                <pre className="whitespace-pre-wrap font-mono leading-relaxed text-slate-300 font-medium">
                  {inspectingRun.logs || '[CONSOLE LOGS EMPTY]'}
                </pre>
              </div>

              {/* JSON results inspector */}
              <div className="border border-slate-900 bg-[#05080E] p-4 rounded text-xs overflow-y-auto max-h-[22vh]">
                <div className="text-[10px] text-slate-500 uppercase pb-2 border-b border-slate-950 mb-2 flex items-center gap-2">
                  <Code className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Payload de Saída JSON (Collapsible)</span>
                </div>
                <pre className="text-[10px] text-slate-400 bg-black/40 p-2.5 rounded overflow-x-auto border border-slate-950">
                  {JSON.stringify(inspectingRun.result || {}, null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <FlaskConical className="h-14 w-14 text-slate-700 mb-4 animate-pulse" />
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">
                Aguardando Inspeção de Teste
              </h3>
              <p className="text-[10px] text-slate-600 uppercase max-w-xs leading-normal">
                Selecione uma execução na barra lateral para carregar seus logs de depuração e resultados JSON
              </p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
