'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert, ShieldCheck, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (d.authenticated) router.push('/');
      })
      .catch(() => {});
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || 'Credenciais inválidas');
      } else {
        setSuccessMessage('Acesso autorizado! Redirecionando...');
        setTimeout(() => router.push('/'), 800);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro de autenticação');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#090D16] text-[#F3F4F6] font-mono px-4 py-8">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#111827_1px,transparent_1px),linear-gradient(to_bottom,#111827_1px,transparent_1px)] bg-[size:4rem_4rem] pointer-events-none opacity-40" />

      <div className="relative w-full max-w-md border border-[#1E293B] bg-[#0E1525]/90 px-8 py-10 rounded shadow-2xl backdrop-blur-md">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500 via-cyan-500 to-indigo-500" />

        <div className="flex flex-col items-center mb-8">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-950/20 text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.2)]">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold tracking-widest text-[#F3F4F6] uppercase">AEGIS CONTROL</h1>
          <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider">Neon · Operational Command Hub</p>
        </div>

        {errorMessage && (
          <div className="mb-6 flex items-start gap-3 border border-red-900/80 bg-red-950/40 p-4 rounded text-xs text-red-400">
            <ShieldAlert className="h-5 w-5 shrink-0 text-red-500" />
            <div>
              <p className="font-bold uppercase tracking-wider">SECURITY_EXCEPTION</p>
              <p className="mt-1 leading-relaxed">{errorMessage}</p>
            </div>
          </div>
        )}

        {successMessage && (
          <div className="mb-6 flex items-start gap-3 border border-emerald-900/80 bg-emerald-950/40 p-4 rounded text-xs text-emerald-400">
            <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-500" />
            <div>
              <p className="font-bold uppercase tracking-wider">ACCESS_GRANTED</p>
              <p className="mt-1 leading-relaxed">{successMessage}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-xs uppercase font-semibold text-slate-400 mb-2 tracking-wider">
              Operator Passkey
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                <Lock className="h-4 w-4" />
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                disabled={loading}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-[#070A13] border border-[#1E293B] pl-10 pr-10 py-2.5 rounded text-sm text-slate-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 font-mono transition-all duration-150 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 hover:text-slate-300"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-2 text-[10px] text-slate-600">
              Defina AEGIS_ADMIN_PASSWORD no ambiente. Se vazio, acesso fica aberto (dev).
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3 px-4 rounded text-xs uppercase tracking-widest transition-all duration-150 border border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.3)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                AUTHENTICATING...
              </>
            ) : (
              'AUTHORIZE ACCESS'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
