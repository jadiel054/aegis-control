'use client';

import React, { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Settings2, User, ShieldCheck, Palette } from 'lucide-react';

interface SettingsTab {
  id: string;
  label: string;
  path: string;
  icon: React.ElementType;
}

const tabs: SettingsTab[] = [
  { id: 'profile', label: 'Perfil', path: '/settings/profile', icon: User },
  { id: 'security', label: 'Sessões', path: '/settings/security', icon: ShieldCheck },
  { id: 'personalization', label: 'Personalização', path: '/settings/personalization', icon: Palette },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState(() => {
    const current = tabs.find((t) => pathname.startsWith(t.path));
    return current?.id || 'profile';
  });

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-widest uppercase flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-cyan-400" />
              <span>Configurações</span>
            </h1>
            <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">
              Gerencie sua experiência Aegis
            </p>
          </div>
        </div>

        <div className="border border-[#1E293B] bg-[#080D17]/80 rounded">
          <nav className="flex border-b border-[#1E293B] p-1">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <Link
                  key={tab.id}
                  href={tab.path}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-xs uppercase font-bold tracking-widest rounded transition-all ${
                    isActive
                      ? 'bg-cyan-950/20 text-cyan-400 border-b-2 border-cyan-500'
                      : 'text-slate-500 hover:text-slate-300 hover:bg-[#121A2E]'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
                  <span>{tab.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="p-6">{children}</div>
        </div>
      </div>
    </DashboardLayout>
  );
}
