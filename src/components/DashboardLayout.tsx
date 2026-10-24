'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import AuthGuard from './AuthGuard';
import {
  LayoutDashboard,
  KanbanSquare,
  Terminal,
  Activity,
  ShieldAlert,
  FlaskConical,
  Settings2,
  LogOut,
  Menu,
  X,
  Radio,
  UserCheck,
  ListTodo,
} from 'lucide-react';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [operatorEmail, setOperatorEmail] = useState('operator@aegis.internal');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pulseState, setPulseState] = useState(true);

  useEffect(() => {
    setOperatorEmail('aegis-operator');
    const interval = setInterval(() => setPulseState((p) => !p), 1500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const navItems = [
    { name: 'Visão Geral', path: '/', icon: LayoutDashboard },
    { name: 'Config. Agentes', path: '/agents', icon: Settings2 },
    { name: 'Quadro de Missões', path: '/missions', icon: ListTodo },
    { name: 'Quadro de Tarefas', path: '/tasks', icon: KanbanSquare },
    { name: 'Painel de Comandos', path: '/commands', icon: Terminal },
    { name: 'Feed em Tempo Real', path: '/messages', icon: Activity },
    { name: 'Quadro de Segurança', path: '/security', icon: ShieldAlert },
    { name: 'Painel de Testes', path: '/tests', icon: FlaskConical },
  ];

  return (
    <AuthGuard>
      <div className="flex h-screen bg-[#05070C] text-[#F3F4F6] font-mono overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#090d16_1px,transparent_1px),linear-gradient(to_bottom,#090d16_1px,transparent_1px)] bg-[size:4rem_4rem] pointer-events-none opacity-40" />

        {sidebarOpen && (
          <button
            type="button"
            aria-label="Fechar menu"
            className="fixed inset-0 z-40 bg-black/60 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <aside
          className={`fixed inset-y-0 left-0 z-50 flex flex-col w-64 border-r border-[#1E293B] bg-[#0A0F1D]/95 transition-transform duration-200 lg:static lg:translate-x-0 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between h-16 px-6 border-b border-[#1E293B] bg-[#0D1527]">
            <Link href="/" className="flex items-center gap-2.5" onClick={() => setSidebarOpen(false)}>
              <span className="relative flex h-3 w-3">
                <span className={`absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75 ${pulseState ? 'animate-ping' : ''}`} />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500" />
              </span>
              <span className="font-bold tracking-[0.2em] text-sm text-[#F3F4F6]">AEGIS CONTROL</span>
            </Link>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-[#1E293B]/50 lg:hidden"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
            <div className="px-3 mb-4 text-[10px] uppercase font-semibold text-slate-500 tracking-widest">
              NOC / SOC Operations · Neon
            </div>
            {navItems.map((item) => {
              const isActive = pathname === item.path;
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded text-xs uppercase tracking-wider transition-all duration-150 border ${
                    isActive
                      ? 'bg-cyan-950/20 text-cyan-400 border-cyan-500/30 shadow-[inset_0_0_8px_rgba(6,182,212,0.1)]'
                      : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-[#111827]/60'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
                  <span className="font-semibold">{item.name}</span>
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-[#1E293B] bg-[#080D1A]">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center justify-center w-8 h-8 rounded border border-cyan-500/20 bg-cyan-950/20 text-cyan-400">
                <UserCheck className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider">Active Operator</p>
                <p className="text-xs font-bold text-slate-300 truncate">{operatorEmail}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-red-900/30 hover:border-red-600 bg-red-950/10 hover:bg-red-950/30 text-red-400 text-[11px] font-bold uppercase tracking-widest rounded transition-all duration-150"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>TERMINAL EXIT</span>
            </button>
          </div>
        </aside>

        <div className="flex flex-col flex-1 min-w-0 overflow-hidden relative">
          <header className="flex items-center justify-between h-16 px-6 border-b border-[#1E293B] bg-[#0A0F1D]/90 backdrop-blur-md z-40">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-[#1E293B]/50 lg:hidden"
                aria-label="Abrir menu"
              >
                <Menu className="h-6 w-6" />
              </button>
              <div className="hidden sm:flex items-center gap-3">
                <div className="flex items-center gap-1.5 border border-emerald-500/20 bg-emerald-950/20 px-2.5 py-1 rounded text-[10px] text-emerald-400 uppercase font-semibold">
                  <Radio className="h-3 w-3 animate-pulse" />
                  <span>NEON PROTOCOL ACTIVE</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="font-bold text-cyan-400">AEGIS_SOC_v1.1</span>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto p-6 md:p-8 z-10 relative">{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}
