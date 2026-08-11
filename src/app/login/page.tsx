'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { ShieldAlert, ShieldCheck, Lock, Mail, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    // Check if user is already logged in
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push('/');
      }
    };
    checkUser();
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    if (!email || !password) {
      setErrorMessage('Por favor, preencha todos os campos.');
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrorMessage(error.message || 'Erro ao realizar login. Verifique as credenciais.');
      } else if (data?.user) {
        setSuccessMessage('Acesso autorizado! Redirecionando...');
        setTimeout(() => {
          router.push('/');
        }, 1200);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro inesperado no servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#090D16] text-[#F3F4F6] font-mono px-4">
      {/* Background patterns */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#111827_1px,transparent_1px),linear-gradient(to_bottom,#111827_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none opacity-40"></div>

      <div className="relative w-full max-w-md border border-[#1E293B] bg-[#0E1525]/90 px-8 py-10 rounded shadow-2xl backdrop-blur-md">
        {/* Neon Indicator line */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500 via-cyan-500 to-indigo-500"></div>

        <div className="flex flex-col items-center mb-8">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-950/20 text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.2)]">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold tracking-widest text-[#F3F4F6] uppercase">AEGIS CONTROL</h1>
          <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider">Operational Command Hub</p>
        </div>

        {/* Console / Status alerts */}
        {errorMessage && (
          <div className="mb-6 flex items-start gap-3 border border-red-900 bg-red-950/30 p-4 rounded text-xs text-red-400">
            <ShieldAlert className="h-5 w-5 shrink-0 text-red-500" />
            <div>
              <p className="font-bold uppercase">SECURITY_EXCEPTION</p>
              <p className="mt-1">{errorMessage}</p>
            </div>
          </div>
        )}

        {successMessage && (
          <div className="mb-6 flex items-start gap-3 border border-emerald-900 bg-emerald-950/30 p-4 rounded text-xs text-emerald-400">
            <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-500" />
            <div>
              <p className="font-bold uppercase">ACCESS_GRANTED</p>
              <p className="mt-1">{successMessage}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-xs uppercase font-semibold text-slate-400 mb-2 tracking-wider">
              System Operator ID (Email)
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                <Mail className="h-4 w-4" />
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@aegis.internal"
                className="w-full bg-[#070A13] border border-[#1E293B] pl-10 pr-4 py-2.5 rounded text-sm text-slate-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 font-mono transition-all duration-150"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase font-semibold text-slate-400 mb-2 tracking-wider">
              Secret Passkey
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                <Lock className="h-4 w-4" />
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-[#070A13] border border-[#1E293B] pl-10 pr-10 py-2.5 rounded text-sm text-slate-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 font-mono transition-all duration-150"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 hover:text-slate-300"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3 px-4 rounded text-xs uppercase tracking-widest transition-all duration-150 border border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'AUTHENTICATING...' : 'AUTHORIZE ACCESS'}
          </button>
        </form>

        <div className="mt-8 border-t border-[#1E293B] pt-4 flex justify-between text-[10px] text-slate-500">
          <span>SECURE PROTOCOL v4.12</span>
          <span>RESTRICTED LOGON ONLY</span>
        </div>
      </div>
    </div>
  );
}
