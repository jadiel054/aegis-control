'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { ShieldAlert, ShieldCheck, Lock, Mail, Eye, EyeOff, UserPlus, KeyRound, ArrowLeft, Loader2 } from 'lucide-react';

type AuthMode = 'login' | 'signup' | 'forgot_password';

const GoogleIcon = () => (
  <svg className="w-4 h-4 mr-2.5 shrink-0" viewBox="0 0 24 24">
    <path
      fill="#EA4335"
      d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.2 9 5 12 5z"
    />
    <path
      fill="#4285F4"
      d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
    />
    <path
      fill="#FBBC05"
      d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 10.8 0 12s.7 2.3 1.9 4.7l3.7-2.9z"
    />
    <path
      fill="#34A853"
      d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.2-6.4-5.2L1.9 16c1.8 3.7 5.6 7 10.1 7z"
    />
  </svg>
);

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
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

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setErrorMessage('');
    setSuccessMessage('');
    setPassword('');
    setConfirmPassword('');
  };

  const mapErrorMessage = (error: any): string => {
    const message = error?.message || '';
    if (message.includes('Invalid login credentials')) {
      return 'Credenciais de acesso inválidas. Verifique o e-mail e a senha.';
    }
    if (message.includes('User already registered')) {
      return 'Este e-mail já está cadastrado no sistema.';
    }
    if (message.includes('Password should be at least')) {
      return 'A senha deve conter no mínimo 6 caracteres.';
    }
    if (message.includes('Email not confirmed')) {
      return 'E-mail não confirmado. Por favor, verifique sua caixa de entrada.';
    }
    if (message.includes('Rate limit exceeded') || message.includes('too many requests')) {
      return 'Muitas tentativas em pouco tempo. Aguarde alguns instantes e tente novamente.';
    }
    return message || 'Ocorreu um erro durante a autenticação. Tente novamente.';
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    if (!email || !password) {
      setErrorMessage('Por favor, preencha todos os campos obrigatórios.');
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrorMessage(mapErrorMessage(error));
      } else if (data?.user) {
        setSuccessMessage('Acesso autorizado! Redirecionando para a central...');
        setTimeout(() => {
          router.push('/');
        }, 1200);
      }
    } catch (err: any) {
      setErrorMessage(mapErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    if (!email || !password || !confirmPassword) {
      setErrorMessage('Por favor, preencha todos os campos obrigatórios.');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setErrorMessage('A senha deve conter no mínimo 6 caracteres.');
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('As senhas digitadas não coincidem.');
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}/login`,
        },
      });

      if (error) {
        setErrorMessage(mapErrorMessage(error));
      } else if (data?.user) {
        if (data.session) {
          setSuccessMessage('Conta de operador criada com sucesso! Redirecionando...');
          setTimeout(() => {
            router.push('/');
          }, 1500);
        } else {
          setSuccessMessage('Credenciais registradas! Verifique seu e-mail para confirmar a conta.');
        }
      }
    } catch (err: any) {
      setErrorMessage(mapErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    if (!email) {
      setErrorMessage('Por favor, informe seu e-mail de operador.');
      setLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}/login`,
      });

      if (error) {
        setErrorMessage(mapErrorMessage(error));
      } else {
        setSuccessMessage('Instruções para redefinição enviadas! Verifique sua caixa de entrada.');
      }
    } catch (err: any) {
      setErrorMessage(mapErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}/`,
        },
      });

      if (error) {
        setErrorMessage(mapErrorMessage(error));
        setGoogleLoading(false);
      }
    } catch (err: any) {
      setErrorMessage(mapErrorMessage(err));
      setGoogleLoading(false);
    }
  };

  const isProcessing = loading || googleLoading;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#090D16] text-[#F3F4F6] font-mono px-4 py-8">
      {/* Background patterns */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#111827_1px,transparent_1px),linear-gradient(to_bottom,#111827_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none opacity-40"></div>

      <div className="relative w-full max-w-md border border-[#1E293B] bg-[#0E1525]/90 px-8 py-10 rounded shadow-2xl backdrop-blur-md">
        {/* Neon Indicator line */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500 via-cyan-500 to-indigo-500"></div>

        <div className="flex flex-col items-center mb-8">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-950/20 text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.2)]">
            {mode === 'login' && <Lock className="h-6 w-6" />}
            {mode === 'signup' && <UserPlus className="h-6 w-6" />}
            {mode === 'forgot_password' && <KeyRound className="h-6 w-6" />}
          </div>
          <h1 className="text-xl font-bold tracking-widest text-[#F3F4F6] uppercase">AEGIS CONTROL</h1>
          <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider">
            {mode === 'login' && 'Operational Command Hub'}
            {mode === 'signup' && 'Operator Credentials Enrollment'}
            {mode === 'forgot_password' && 'Security Passkey Recovery'}
          </p>
        </div>

        {/* Console / Status alerts */}
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
              <p className="font-bold uppercase tracking-wider">
                {mode === 'login' && 'ACCESS_GRANTED'}
                {mode === 'signup' && 'OPERATOR_REGISTERED'}
                {mode === 'forgot_password' && 'RECOVERY_INITIATED'}
              </p>
              <p className="mt-1 leading-relaxed">{successMessage}</p>
            </div>
          </div>
        )}

        {/* Form rendering according to mode */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-5">
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
                  disabled={isProcessing}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operator@aegis.internal"
                  className="w-full bg-[#070A13] border border-[#1E293B] pl-10 pr-4 py-2.5 rounded text-sm text-slate-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 font-mono transition-all duration-150 disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-xs uppercase font-semibold text-slate-400 tracking-wider">
                  Secret Passkey
                </label>
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => switchMode('forgot_password')}
                  className="text-[11px] text-cyan-400 hover:text-cyan-300 hover:underline transition-colors disabled:opacity-50"
                >
                  Esqueceu a senha?
                </button>
              </div>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                  <Lock className="h-4 w-4" />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  disabled={isProcessing}
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
            </div>

            <button
              type="submit"
              disabled={isProcessing}
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
        )}

        {mode === 'signup' && (
          <form onSubmit={handleSignUp} className="space-y-5">
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
                  disabled={isProcessing}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operator@aegis.internal"
                  className="w-full bg-[#070A13] border border-[#1E293B] pl-10 pr-4 py-2.5 rounded text-sm text-slate-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 font-mono transition-all duration-150 disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs uppercase font-semibold text-slate-400 mb-2 tracking-wider">
                Secret Passkey (Min. 6 chars)
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                  <Lock className="h-4 w-4" />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  disabled={isProcessing}
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
            </div>

            <div>
              <label className="block text-xs uppercase font-semibold text-slate-400 mb-2 tracking-wider">
                Confirm Passkey
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                  <Lock className="h-4 w-4" />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  disabled={isProcessing}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-[#070A13] border border-[#1E293B] pl-10 pr-4 py-2.5 rounded text-sm text-slate-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 font-mono transition-all duration-150 disabled:opacity-50"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isProcessing}
              className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold py-3 px-4 rounded text-xs uppercase tracking-widest transition-all duration-150 border border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.3)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ENROLLING...
                </>
              ) : (
                'REGISTER OPERATOR'
              )}
            </button>
          </form>
        )}

        {mode === 'forgot_password' && (
          <form onSubmit={handleForgotPassword} className="space-y-5">
            <div>
              <label className="block text-xs uppercase font-semibold text-slate-400 mb-2 tracking-wider">
                Registered Operator Email
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                  <Mail className="h-4 w-4" />
                </span>
                <input
                  type="email"
                  required
                  disabled={isProcessing}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operator@aegis.internal"
                  className="w-full bg-[#070A13] border border-[#1E293B] pl-10 pr-4 py-2.5 rounded text-sm text-slate-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 font-mono transition-all duration-150 disabled:opacity-50"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isProcessing}
              className="w-full bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white font-bold py-3 px-4 rounded text-xs uppercase tracking-widest transition-all duration-150 border border-cyan-500/50 shadow-[0_0_15px_rgba(20,184,166,0.3)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  DISPATCHING LINK...
                </>
              ) : (
                'SEND RECOVERY EMAIL'
              )}
            </button>

            <button
              type="button"
              disabled={isProcessing}
              onClick={() => switchMode('login')}
              className="w-full flex items-center justify-center text-xs text-slate-400 hover:text-slate-200 transition-colors pt-2 disabled:opacity-50"
            >
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
              Voltar ao Login
            </button>
          </form>
        )}

        {/* Social Login with Google - visible on login and signup screens */}
        {mode !== 'forgot_password' && (
          <div className="mt-6">
            <div className="relative flex items-center justify-center my-6">
              <div className="border-t border-[#1E293B] w-full"></div>
              <span className="bg-[#0E1525] px-3 text-[10px] uppercase text-slate-500 tracking-wider font-semibold whitespace-nowrap">
                OU AUTENTIQUE COM
              </span>
              <div className="border-t border-[#1E293B] w-full"></div>
            </div>

            <button
              type="button"
              disabled={isProcessing}
              onClick={handleGoogleLogin}
              className="w-full bg-[#070A13] hover:bg-[#111827] text-slate-200 hover:text-white font-medium py-2.5 px-4 rounded text-xs uppercase tracking-wider transition-all duration-150 border border-[#1E293B] hover:border-slate-600 flex items-center justify-center shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {googleLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin text-cyan-400" />
                  CONNECTING TO GOOGLE...
                </>
              ) : (
                <>
                  <GoogleIcon />
                  Entrar com Google
                </>
              )}
            </button>
          </div>
        )}

        {/* Mode Toggle footer */}
        {mode !== 'forgot_password' && (
          <div className="mt-6 text-center text-xs text-slate-400">
            {mode === 'login' ? (
              <p>
                Novo operador?{' '}
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => switchMode('signup')}
                  className="text-cyan-400 hover:text-cyan-300 font-semibold underline underline-offset-2 ml-1 transition-colors disabled:opacity-50"
                >
                  Criar Conta
                </button>
              </p>
            ) : (
              <p>
                Já possui acesso?{' '}
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => switchMode('login')}
                  className="text-cyan-400 hover:text-cyan-300 font-semibold underline underline-offset-2 ml-1 transition-colors disabled:opacity-50"
                >
                  Acessar Painel
                </button>
              </p>
            )}
          </div>
        )}

        <div className="mt-8 border-t border-[#1E293B] pt-4 flex justify-between text-[10px] text-slate-500">
          <span>SECURE PROTOCOL v4.12</span>
          <span>RESTRICTED LOGON ONLY</span>
        </div>
      </div>
    </div>
  );
}
