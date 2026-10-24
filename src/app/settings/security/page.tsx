'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { ShieldCheck, Clock, LogOut, AlertTriangle, Key, Eye, EyeOff, RefreshCw } from 'lucide-react';

interface Session {
  id: string;
  userAgent: string;
  ipAddress: string;
  createdAt: string;
  lastSeen: string;
  isCurrent: boolean;
}

export default function SecuritySettingsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      // In production, this would fetch from /api/operator/sessions
      // For now, using mock data
      const mockSessions: Session[] = [
        {
          id: 'sess-' + Math.random().toString(36).substr(2, 9),
          userAgent: navigator.userAgent || 'Unknown Browser',
          ipAddress: '192.168.1.100',
          createdAt: new Date(Date.now() - 86400000).toISOString(),
          lastSeen: new Date().toISOString(),
          isCurrent: true,
        },
        {
          id: 'sess-' + Math.random().toString(36).substr(2, 9),
          userAgent: 'Chrome 120.0 / macOS / Desktop',
          ipAddress: '192.168.1.101',
          createdAt: new Date(Date.now() - 172800000).toISOString(),
          lastSeen: new Date(Date.now() - 3600000).toISOString(),
          isCurrent: false,
        },
        {
          id: 'sess-' + Math.random().toString(36).substr(2, 9),
          userAgent: 'Firefox 115.0 / Windows 11 / Desktop',
          ipAddress: '192.168.1.102',
          createdAt: new Date(Date.now() - 259200000).toISOString(),
          lastSeen: new Date(Date.now() - 86400000).toISOString(),
          isCurrent: false,
        },
      ];
      
      setSessions(mockSessions);
    } catch (err) {
      console.error('Failed to load sessions:', err);
      setError('Erro ao carregar sessões');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const formatDate = useCallback((dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, []);

  const formatRelativeTime = useCallback((dateString: string): string => {
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
  }, [formatDate]);

  const terminateSession = useCallback(async (sessionId: string) => {
    if (sessionId === sessions.find((s) => s.isCurrent)?.id) {
      setError('Não é possível encerrar a sessão atual');
      return;
    }

    try {
      // In production: await fetch('/api/operator/sessions/' + sessionId, { method: 'DELETE' })
      setSessions((prev) => {
        const updated = prev.filter((s) => s.id !== sessionId);
        return updated;
      });
      setMsg('Sessão encerrada com sucesso');
    } catch (err) {
      setError('Erro ao encerrar sessão');
      console.error('Failed to terminate session:', err);
    }
  }, [sessions]);

  const terminateAllSessions = useCallback(async () => {
    const currentSession = sessions.find((s) => s.isCurrent);
    
    if (!currentSession) {
      setError('Nenhuma sessão atual encontrada');
      return;
    }

    try {
      // In production: await fetch('/api/operator/sessions/all', { method: 'DELETE' })
      setSessions([currentSession]);
      setMsg('Todas as outras sessões foram encerradas');
    } catch (err) {
      setError('Erro ao encerrar sessões');
      console.error('Failed to terminate all sessions:', err);
    }
  }, [sessions]);

  const handleChangePassword = useCallback(async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Preencha todos os campos');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem');
      return;
    }

    if (newPassword.length < 8) {
      setError('A senha deve ter pelo menos 8 caracteres');
      return;
    }

    setSaving(true);
    setMsg(null);
    setError(null);

    try {
      // In production, this would call the API to update password
      // For now, we simulate the API call
      const response = await fetch('/api/operator/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Erro ao alterar senha');
      }

      setMsg('Senha alterada com sucesso');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err.message || 'Erro ao alterar senha');
      console.error('Failed to change password:', err);
    } finally {
      setSaving(false);
    }
  }, [currentPassword, newPassword, confirmPassword]);

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
                disabled={sessions.length <= 1}
                className="text-xs uppercase tracking-widest text-red-400/80 hover:text-red-400 transition-colors disabled:opacity-50"
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
                          IP: {session.ipAddress}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          ID: {session.id.slice(0, 8)}...
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
          Nota: Para gerenciamento real de sessões, é necessário migrar para tokens aleatórios no banco de dados Neon.
          Atualmente, esta é uma simulação.
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
              <span className="text-xs text-emerald-400">{msg}</span>
            )}
            {error && (
              <span className="text-xs text-red-400">{error}</span>
            )}
          </div>
        </div>

        <p className="text-[10px] text-slate-600 mt-3">
          <AlertTriangle className="h-3 w-3 inline mr-1" />
          Nota: Para alteração real de senha, é necessário migrar para hash (bcrypt/argon2) no banco de dados Neon.
          Atualmente, esta é uma simulação.
        </p>
      </section>

      <div className="border border-[#1E293B] bg-[#080D17]/80 rounded p-4">
        <h3 className="text-xs uppercase tracking-widest text-slate-400 mb-3">
          Informações
        </h3>
        <p className="text-[10px] text-slate-500 leading-relaxed">
          🔒 Sessões são gerenciadas via banco de dados Neon<br />
          🔑 Senhas são armazenadas com hash (em implementação futura)
        </p>
      </div>
    </div>
  );
}
