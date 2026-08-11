'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { supabase } from '@/lib/supabaseClient';
import {
  Activity,
  Filter,
  Send,
  Loader2,
  Trash2,
  AlertOctagon,
  ArrowRightLeft,
  ChevronRight,
  Plus
} from 'lucide-react';

interface Agent {
  id: string;
  name: string;
}

interface Message {
  id: string;
  from_agent_id: string;
  to_agent_id: string | null;
  task_id: string | null;
  content: string;
  type: 'request' | 'response' | 'log' | 'error';
  created_at: string;
}

export default function MessagesPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [filteredMessages, setFilteredMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedAgentFilter, setSelectedAgentFilter] = useState<string>('all');

  // New message form state
  const [fromAgent, setFromAgent] = useState('');
  const [toAgent, setToAgent] = useState('');
  const [content, setContent] = useState('');
  const [msgType, setMsgType] = useState<Message['type']>('log');
  const [submitLoading, setSubmitLoading] = useState(false);

  const fetchData = async () => {
    try {
      const { data: agentsData } = await supabase.from('agents').select('id, name').order('name');
      const { data: messagesData } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (agentsData) {
        setAgents(agentsData);
        if (agentsData.length > 0 && !fromAgent) {
          setFromAgent(agentsData[0].id);
        }
      }
      if (messagesData) {
        setMessages(messagesData as Message[]);
        setFilteredMessages(messagesData as Message[]);
      }
    } catch (err) {
      console.error('Error fetching messages/agents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Subscribe to realtime messages
    const messagesChannel = supabase
      .channel('messages-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          setMessages((prev) => [payload.new as Message, ...prev.slice(0, 99)]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
    };
  }, []);

  // Compute filtering
  useEffect(() => {
    let result = messages;

    if (selectedType !== 'all') {
      result = result.filter((m) => m.type === selectedType);
    }

    if (selectedAgentFilter !== 'all') {
      result = result.filter((m) => m.from_agent_id === selectedAgentFilter || m.to_agent_id === selectedAgentFilter);
    }

    setFilteredMessages(result);
  }, [messages, selectedType, selectedAgentFilter]);

  const handlePostMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content || !fromAgent) return;

    setSubmitLoading(true);
    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_agent_id: fromAgent,
          to_agent_id: toAgent || null,
          content,
          type: msgType,
        }),
      });

      if (response.ok) {
        setContent('');
      } else {
        console.error('Failed to dispatch message');
      }
    } catch (err) {
      console.error('Network error posting message:', err);
    } finally {
      setSubmitLoading(false);
    }
  };

  const getLogTypeColor = (type: Message['type']) => {
    switch (type) {
      case 'error':
        return 'text-red-400 bg-red-950/20 border-red-900/30';
      case 'request':
        return 'text-blue-400 bg-blue-950/20 border-blue-900/30';
      case 'response':
        return 'text-emerald-400 bg-emerald-950/20 border-emerald-900/30';
      case 'log':
        return 'text-slate-400 bg-slate-950/40 border-slate-800';
    }
  };

  const clearMessages = async () => {
    if (confirm('Deseja limpar todos os registros do histórico de mensagens localmente? (Não apaga do banco de dados)')) {
      setMessages([]);
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
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-widest text-[#F3F4F6] uppercase">FEED DE MENSAGENS E LOGS</h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">
            Real-time audit stream and diagnostic message board (Supabase Realtime)
          </p>
        </div>
        <button
          onClick={clearMessages}
          className="self-start flex items-center gap-1.5 px-3 py-1.5 border border-red-950 hover:border-red-600 bg-red-950/10 text-red-400 text-[10px] font-bold uppercase tracking-widest rounded transition-all duration-150"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span>LIMPAR FEED LOCAL</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Left pane: Filters & Manual Post Form */}
        <div className="lg:col-span-1 space-y-6">
          {/* Filters card */}
          <div className="border border-[#1E293B] bg-[#080D17]/80 rounded p-6">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-300 mb-4 flex items-center gap-2">
              <Filter className="h-4 w-4 text-cyan-400" />
              <span>Filtros do Sistema</span>
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-[9px] uppercase font-bold text-slate-500 mb-1.5 tracking-wider">
                  Tipo de Log
                </label>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="w-full bg-[#05070C] border border-[#1E293B] px-3 py-2 rounded text-xs text-slate-300 focus:outline-none focus:border-cyan-500 cursor-pointer"
                >
                  <option value="all">TODOS OS LOGS</option>
                  <option value="log">LOGS DO AGENTE</option>
                  <option value="request">REQUESTS (PEDIDOS)</option>
                  <option value="response">RESPONSES (RESPOSTAS)</option>
                  <option value="error">ERROS / FALHAS</option>
                </select>
              </div>

              <div>
                <label className="block text-[9px] uppercase font-bold text-slate-500 mb-1.5 tracking-wider">
                  Por Agente de IA
                </label>
                <select
                  value={selectedAgentFilter}
                  onChange={(e) => setSelectedAgentFilter(e.target.value)}
                  className="w-full bg-[#05070C] border border-[#1E293B] px-3 py-2 rounded text-xs text-slate-300 focus:outline-none focus:border-cyan-500 cursor-pointer"
                >
                  <option value="all">TODOS OS AGENTES</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Trigger manual post message to logs */}
          <div className="border border-[#1E293B] bg-[#080D17]/80 rounded p-6 relative">
            <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-cyan-500 to-blue-500"></div>

            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-300 mb-4 flex items-center gap-1.5">
              <Plus className="h-4 w-4 text-cyan-400" />
              <span>Simular Mensagem / Log</span>
            </h3>

            <form onSubmit={handlePostMessage} className="space-y-4">
              <div>
                <label className="block text-[9px] uppercase font-bold text-slate-500 mb-1.5 tracking-wider">
                  De (Agent)
                </label>
                <select
                  value={fromAgent}
                  onChange={(e) => setFromAgent(e.target.value)}
                  className="w-full bg-[#05070C] border border-[#1E293B] px-3 py-2 rounded text-xs text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
                >
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[9px] uppercase font-bold text-slate-500 mb-1.5 tracking-wider">
                  Para (Destinatário Opcional)
                </label>
                <select
                  value={toAgent}
                  onChange={(e) => setToAgent(e.target.value)}
                  className="w-full bg-[#05070C] border border-[#1E293B] px-3 py-2 rounded text-xs text-slate-300 focus:outline-none focus:border-cyan-500 cursor-pointer"
                >
                  <option value="">Sem Destinatário (Geral)</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[9px] uppercase font-bold text-slate-500 mb-1.5 tracking-wider">
                  Classificação / Tipo
                </label>
                <select
                  value={msgType}
                  onChange={(e) => setMsgType(e.target.value as any)}
                  className="w-full bg-[#05070C] border border-[#1E293B] px-3 py-2 rounded text-xs text-slate-300 focus:outline-none focus:border-cyan-500 cursor-pointer"
                >
                  <option value="log">Log Informativo</option>
                  <option value="request">Pedido (Request)</option>
                  <option value="response">Resposta (Response)</option>
                  <option value="error">Aviso de Erro (Error)</option>
                </select>
              </div>

              <div>
                <label className="block text-[9px] uppercase font-bold text-slate-500 mb-1.5 tracking-wider">
                  Conteúdo do Log
                </label>
                <textarea
                  required
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Ex: Conexão estabelecida com sucesso na porta 8080."
                  rows={3}
                  className="w-full bg-[#05070C] border border-[#1E293B] px-3 py-2 rounded text-xs text-slate-300 font-mono focus:outline-none focus:border-cyan-500 resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitLoading || !fromAgent}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs uppercase tracking-widest rounded transition-all duration-150 shadow-[0_0_12px_rgba(34,211,238,0.2)] disabled:opacity-50"
              >
                {submitLoading ? (
                  <Loader2 className="h-4.5 w-4.5 animate-spin" />
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    <span>PUBLICAR LOG</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Right pane: Message logs livestream terminal */}
        <div className="lg:col-span-3 border border-[#1E293B] bg-[#070A14]/90 p-6 rounded flex flex-col h-[80vh]">
          {/* Terminal header */}
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-300 flex items-center gap-2">
              <Activity className="h-4.5 w-4.5 text-cyan-400 animate-pulse" />
              <span>Terminal Real-Time logs livestream</span>
            </h3>
            <span className="text-[10px] text-cyan-400/80 font-semibold blink uppercase tracking-widest">
              LIVESTREAM ENCRYPTED
            </span>
          </div>

          {/* Terminal log window */}
          <div className="flex-1 overflow-y-auto space-y-3 font-mono text-[11px] pr-1">
            {filteredMessages.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-slate-600 text-xs uppercase font-bold border border-dashed border-slate-800 rounded">
                Sem logs encontrados para os critérios aplicados.
              </div>
            ) : (
              filteredMessages.map((msg) => {
                const fromAgentName = agents.find((a) => a.id === msg.from_agent_id)?.name || 'Agente';
                const toAgentName = msg.to_agent_id ? agents.find((a) => a.id === msg.to_agent_id)?.name : null;
                const typeStyle = getLogTypeColor(msg.type);

                return (
                  <div
                    key={msg.id}
                    className="flex flex-col border border-slate-900/60 bg-[#05070D] p-3 rounded hover:bg-[#0A0F1D]/80 transition-all duration-100"
                  >
                    <div className="flex items-center justify-between gap-4 flex-wrap mb-2">
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className="text-slate-500">
                          [{new Date(msg.created_at).toLocaleTimeString()}]
                        </span>
                        <span className="text-cyan-400 font-extrabold uppercase">
                          @{fromAgentName}
                        </span>

                        {toAgentName && (
                          <div className="flex items-center gap-1.5 text-slate-400">
                            <ChevronRight className="h-3 w-3 text-slate-600" />
                            <span className="text-cyan-500 font-semibold uppercase">
                              @{toAgentName}
                            </span>
                          </div>
                        )}
                      </div>

                      <span
                        className={`text-[8px] font-bold tracking-widest px-2 py-0.5 rounded border uppercase shrink-0 ${typeStyle}`}
                      >
                        {msg.type}
                      </span>
                    </div>

                    <p className={`whitespace-pre-wrap font-mono leading-relaxed break-words ${msg.type === 'error' ? 'text-red-400/90 font-semibold' : 'text-slate-300'}`}>
                      {msg.content}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .blink {
          animation: blink 1.5s infinite;
        }
      `}</style>
    </DashboardLayout>
  );
}
