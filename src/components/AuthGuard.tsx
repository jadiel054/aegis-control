'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Shield } from 'lucide-react';

interface AuthGuardProps {
  children: React.ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [loadingStep, setLoadingStep] = useState<string>('INITIALIZING PROTOCOLS');

  useEffect(() => {
    let active = true;

    const steps = [
      'ESTABLISHING SECURE SOC TUNNEL...',
      'VERIFYING CRYPTOGRAPHIC KEYS...',
      'CONNECTING TO SUPABASE DATABASE CACHE...',
      'SYNCHRONIZING AI AGENT REGISTRY...',
      'AUTHORIZATION GRANTED.'
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
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          if (active) {
            setAuthenticated(false);
            router.push('/login');
          }
        } else {
          if (active) {
            setAuthenticated(true);
          }
        }
      } catch (err) {
        if (active) {
          setAuthenticated(false);
          router.push('/login');
        }
      }
    };

    checkAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        if (active) {
          setAuthenticated(false);
          router.push('/login');
        }
      } else if (session) {
        if (active) setAuthenticated(true);
      }
    });

    return () => {
      active = false;
      clearInterval(interval);
      subscription.unsubscribe();
    };
  }, [router]);

  if (authenticated === null || authenticated === false) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#05070C] text-[#F3F4F6] font-mono px-6">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#0b0e14_1px,transparent_1px),linear-gradient(to_bottom,#0b0e14_1px,transparent_1px)] bg-[size:3rem_3rem] pointer-events-none opacity-50"></div>

        <div className="relative text-center max-w-sm">
          {/* Pulsing secure shield */}
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-950/10 text-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.15)] animate-pulse">
            <Shield className="h-8 w-8 text-cyan-400" />
          </div>

          <h2 className="text-sm font-bold tracking-widest text-[#F3F4F6] uppercase mb-1">
            SECURE ACCESS CHECK
          </h2>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-6">
            Aegis Control Admin Panel
          </p>

          <div className="w-56 h-1 bg-[#0F172A] rounded overflow-hidden mx-auto mb-4 border border-slate-800">
            <div className="h-full bg-cyan-500 rounded animate-infinite-loading w-1/2"></div>
          </div>

          <div className="text-[10px] text-cyan-400/80 uppercase tracking-widest h-4">
            {loadingStep}
          </div>
        </div>

        {/* CSS for custom animation */}
        <style jsx global>{`
          @keyframes infinite-loading {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(200%); }
          }
          .animate-infinite-loading {
            animation: infinite-loading 1.2s infinite linear;
          }
        `}</style>
      </div>
    );
  }

  return <>{children}</>;
}
