'use client';

import React, { useEffect, useState } from 'react';
import { ShieldCheck, Clock, LogOut, AlertTriangle, Key, Eye, EyeOff, RefreshCw } from 'lucide-react';

interface Session {
  id: string;
  userAgent: string;
  createdAt: string;
  lastSeen: string;
  isCurrent: boolean;
}

const MOCK_SESSIONS: Session[] = [
  {
    id: 'sess-001',
    userAgent: 'Chrome 120.0 / macOS / Desktop',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    lastSeen: new Date().toISOString(),
    isCurrent: true,
  },
  {
    id: 'sess-002',
    userAgent: 'Firefox 115.0 / Windows 11 / Desktop',
    createdAt: new Date(Date.now() - 172800000).toISOString(),
    lastSeen: new Date(Date.now() - 3600000).toISOString(),
    isCurrent: false,
  },
  {
    id: 'sess-003',
    userAgent: 'Safari 17.0 / iOS 17 / Mobile',
    createdAt: new Date(Date.now() - 259200000).toISOString(),
    lastSeen: new Date(Date.now() - 86400000).toISOString(),
    isCurrent: false,
  },
];

export default function SecuritySettingsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    try {
      const saved = localStorage.getItem('aegis-sessions');
      if (saved) {
        setSessions(JSON.parse(saved));
      } else {
        setSessions(MOCK_SESSIONS);
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
      setSessions(MOCK_SESSIONS);
    } finally {
      setLoading(false);
    }
  }, []);

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatRelativeTime = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Agora';
    if (diffMins < 60) return `${diffMins}m atrás`;
    if (diffHours < 24) return `${diffHours}h atrás`;
    if (diffDays < 7) return `${diffDays}d atrás`;
    return formatDate(dateString);
  };

  const terminateSession = (sessionId: string) => {
    if (sessionId === sessions.find((s) => s.isCurrent)?.id) {
      setMsg('Não é possível encerrar a sessão atual');
      return;
    }

    setSessions((prev) => {
      const updated = prev.filter((s) => s.id !== sessionId);
      try {
        localStorage.setItem('aegis-sessions', JSON.stringify(updated));
      } catch (error) {
        console.error('Failed to save sessions:', error);
      }
      return updated;
    });
    setMsg('Sessão encerrada');
  };

  const terminateAllSessions = () => {
    const currentSession = sessions.find((s) => s.isCurrent);
    if (currentSession) {
      setSessions([currentSession]);
      try {
        localStorage.setItem('aegis-sessions', JSON.stringify([currentSession]));
      } catch (error) {
        console.error('Failed to save sessions:', error);
      }
      setMsg('Todas as outras sessões foram encerradas');
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setMsg('Preencha todos os campos');
      return;
    }

    if (newPassword !== confirmPassword) {
      setMsg('As senhas não coincidem');
      return;
    }

    if (newPassword.length < 8) {
      setMsg('A senha deve ter pelo menos 8 caracteres');
      return;
    }

    setSaving(true);
    setMsg(null);

    try {
      const savedPassword = localStorage.getItem('aegis-password');
      if (savedPassword && savedPassword !== currentPassword) {
        setMsg('Senha atual incorreta');
        setSaving(false);
        return;
      }

      localStorage.setItem('aegis-password', newPassword);
      setMsg('Senha alterada com sucesso');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      setMsg('Erro ao alterar senha');
      console.error('Failed to change password:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-5 w-5 animate-spin text-cyan-400" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-8">
      <section>
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="h-5 w-5 text-cyan-400" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-[#F3F4F6]">
            Sessões Ativas
          </h2>
        </div>

        <div className="border border-[#1E293B] bg-[#080D17]/80 rounded overflow-hidden">
          <div className="p-4 border-b border-[#1E293B] bg-[#0A0F1D]/50">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-widest text-slate-500">
                {sessions.length} sessão{sessions.length !== 1 ? 'ões' : ''} ativa{sessions.length !== 1 ? 's' : ''}
              </span>
              <button
                onClick={terminateAllSessions}
                className="text-xs uppercase tracking-widest text-red-400/80 hover:text-red-400 transition-colors"
              >
                Encerrar todas as outras
              </button>
            </div>
          </div>

          <div className="divide-y divide-[#1E293B]">
            {sessions.map((session) => (
              <div key={session.id} className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${session.isCurrent ? 'bg-emerald-500' : 'bg-slate-600'}`} />
                      <div>
                        <p className="text-sm font-semibold text-[#F3F4F6]">
                          {session.userAgent}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {session.id}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-[10px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Criado: {formatRelativeTime(session.createdAt)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        Último acesso: {formatRelativeTime(session.lastSeen)}
                      </span>
                    </div>
                  </div>

                  {!session.isCurrent && (
                    <button
                      onClick={() => terminateSession(session.id)}
                      className="p-2 text-slate-600 hover:text-red-400 transition-colors"
                      title="Encerrar sessão"
                    >
                      <LogOut className="h-4 w-4" />
                    </button>
                  )}

                  {session.isCurrent && (
                    <span className="text-[10px] text-emerald-400 uppercase tracking-wider">
                      Sessão atual
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[10px] text-slate-600 mt-3">
          <AlertTriangle className="h-3 w-3 inline mr-1" />
          Nota: O gerenciamento de sessões real requer migração para tokens aleatórios no banco de dados.
          Atualmente, esta é uma simulação com dados locais.
        </p>
      </section>

      <section>
        <div className="flex items-center gap-2 mb-4">
          <Key className="h-5 w-5 text-cyan-400" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-[#F3F4F6]">
            Alterar Senha
          </h2>
        </div>

        <div className="border border-[#1E293B] bg-[#080D17]/80 rounded p-6 space-y-4">
          <div>
            <label className="block text-[10px] uppercase text-slate-500 mb-2">
              Senha Atual
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Digite sua senha atual"
                className="w-full bg-[#070A13] border border-[#1E293B] px-4 py-3 rounded text-sm text-[#F3F4F6] pr-12 focus:outline-none focus:border-cyan-500/40 focus:bg-[#0C1322]"
              />
              <button
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-cyan-400"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase text-slate-500 mb-2">
              Nova Senha
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Digite sua nova senha"
              className="w-full bg-[#070A13] border border-[#1E293B] px-4 py-3 rounded text-sm text-[#F3F4F6] focus:outline-none focus:border-cyan-500/40 focus:bg-[#0C1322]"
            />
            <p className="text-[10px] text-slate-600 mt-1">
              Mínimo de 8 caracteres
            </p>
          </div>

          <div>
            <label className="block text-[10px] uppercase text-slate-500 mb-2">
              Confirmar Nova Senha
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirme sua nova senha"
              className="w-full bg-[#070A13] border border-[#1E293B] px-4 py-3 rounded text-sm text-[#F3F4F6] focus:outline-none focus:border-cyan-500/40 focus:bg-[#0C1322]"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleChangePassword}
              disabled={saving}
              className="px-4 py-2 bg-cyan-900/40 border border-cyan-500/40 text-cyan-300 text-xs uppercase font-bold tracking-widest rounded disabled:opacity-50 hover:bg-cyan-900/60 transition-colors"
            >
              {saving ? 'Alterando...' : 'Alterar Senha'}
            </button>
            {msg && (
              <span className={`text-xs ${msg.includes('sucesso') ? 'text-emerald-400' : 'text-red-400'}`}>
                {msg}
              </span>
            )}
          </div>
        </div>

        <p className="text-[10px] text-slate-600 mt-3">
          <AlertTriangle className="h-3 w-3 inline mr-1" />
          Nota: A alteração de senha real requer migração para hash no banco de dados Neon.
          Atualmente, esta é uma simulação com localStorage.
        </p>
      </section>
    </div>
  );
}
