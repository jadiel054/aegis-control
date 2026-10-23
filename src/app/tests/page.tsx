'use client';

import React from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { FlaskConical } from 'lucide-react';

export default function TestsPage() {
  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-widest uppercase flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-cyan-400" /> Painel de Testes
        </h1>
        <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">
          Em construção · use comandos run_diagnostic via /commands
        </p>
      </div>
      <div className="border border-[#1E293B] bg-[#080D17]/80 p-6 rounded text-xs text-slate-400">
        Os testes automatizados serão reativados quando o Agent SDK estiver rodando em Plutão / Morpheus / Zarith.
        Por enquanto, dispare <code className="text-cyan-400">run_diagnostic</code> no painel de comandos.
      </div>
    </DashboardLayout>
  );
}
