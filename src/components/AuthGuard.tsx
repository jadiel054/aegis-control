'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield } from 'lucide-react';

interface AuthGuardProps {
  children: React.ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [loadingStep, setLoadingStep] = useState('INITIALIZING PROTOCOLS');

  useEffect(() => {
    let active = true;

    const steps = [
      'ESTABLISHING SECURE SOC TUNNEL...',
      'VERIFYING CRYPTOGRAPHIC KEYS...',
      'CONNECTING TO NEON DATABASE...',
      'SYNCHRONIZING AI AGENT REGISTRY...',
      'AUTHORIZATION GRANTED.',
    ];

    let stepIndex = 0;
    const interval = setInterval(() => {
      if (stepIndex < steps.length - 1) {
        stepIndex++;
        if (active) setLoadingStep(steps[stepIndex]);
      }
    }, 200);

    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (!data.authenticated) {
          if (active) {
            setAuthenticated(false);
            router.push('/login');
          }
        } else if (active) {
          setAuthenticated(true);
        }
      } catch {
        if (active) {
          setAuthenticated(false);
          router.push('/login');
        }
      }
    };

    checkAuth();

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [router]);

  if (authenticated === null || authenticated === false) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#05070C] text-[#F3F4F6] font-mono px-6">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#0b0e14_1px,transparent_1px),linear-gradient(to_bottom,#0b0e14_1px,transparent_1px)] bg-[size:3rem_3rem] pointer-events-none opacity-50" />
        <div className="relative text-center max-w-sm">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-950/10 text-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.15)] animate-pulse">
            <Shield className="h-8 w-8 text-cyan-400" />
          </div>
          <h2 className="text-sm font-bold tracking-widest text-[#F3F4F6] uppercase mb-1">
            SECURE ACCESS CHECK
          </h2>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-6">
            Aegis Control Admin Panel · Neon
          </p>
          <div className="w-56 h-1 bg-[#0F172A] rounded overflow-hidden mx-auto mb-4 border border-slate-800">
            <div className="h-full bg-cyan-500 rounded animate-pulse w-1/2" />
          </div>
          <div className="text-[10px] text-cyan-400/80 uppercase tracking-widest h-4">
            {loadingStep}
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
