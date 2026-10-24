'use client';

import React, { useEffect, useState } from 'react';
import { User, Mail, Image as ImageIcon, Save, Camera } from 'lucide-react';

interface ProfileData {
  displayName: string;
  email: string;
  initials: string;
  avatarColor: string;
}

const PRESET_COLORS = [
  'bg-cyan-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-purple-500',
  'bg-rose-500',
  'bg-indigo-500',
  'bg-teal-500',
  'bg-pink-500',
];

const DEFAULT_AVATAR_COLOR = 'bg-cyan-500';

export default function ProfileSettingsPage() {
  const [profile, setProfile] = useState<ProfileData>({
    displayName: '',
    email: '',
    initials: '',
    avatarColor: DEFAULT_AVATAR_COLOR,
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('aegis-profile');
    if (saved) {
      const parsed = JSON.parse(saved);
      setProfile({
        displayName: parsed.displayName || '',
        email: parsed.email || '',
        initials: parsed.initials || getInitials(parsed.displayName || ''),
        avatarColor: parsed.avatarColor || DEFAULT_AVATAR_COLOR,
      });
    } else {
      setProfile({
        displayName: 'Aegis Operator',
        email: 'operator@aegis.internal',
        initials: 'AO',
        avatarColor: DEFAULT_AVATAR_COLOR,
      });
    }
  }, []);

  const getInitials = (name: string): string => {
    if (!name) return 'AO';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const handleChange = (field: keyof ProfileData, value: string) => {
    setProfile((prev) => {
      const newProfile = { ...prev, [field]: value };
      if (field === 'displayName') {
        newProfile.initials = getInitials(value);
      }
      return newProfile;
    });
    setMsg(null);
  };

  const handleSave = () => {
    setSaving(true);
    setMsg(null);

    const saveData = {
      displayName: profile.displayName.trim(),
      email: profile.email.trim(),
      initials: profile.initials,
      avatarColor: profile.avatarColor,
    };

    try {
      localStorage.setItem('aegis-profile', JSON.stringify(saveData));
      setMsg('Perfil salvo com sucesso');
    } catch (error) {
      setMsg('Erro ao salvar perfil');
      console.error('Failed to save profile:', error);
    } finally {
      setSaving(false);
    }
  };

  const selectColor = (color: string) => {
    setProfile((prev) => ({ ...prev, avatarColor: color }));
    setShowColorPicker(false);
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="text-center">
        <div className="relative inline-block">
          <div
            className={`w-24 h-24 rounded-full ${profile.avatarColor} flex items-center justify-center text-2xl font-bold text-white border-4 border-[#0A0F1D] shadow-lg`}
          >
            {profile.initials}
          </div>
          <button
            onClick={() => setShowColorPicker(!showColorPicker)}
            className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[#0A0F1D]/80 border border-[#1E293B] flex items-center justify-center text-slate-400 hover:text-cyan-400 hover:bg-[#121A2E] transition-colors"
          >
            <Camera className="h-4 w-4" />
          </button>
        </div>

        {showColorPicker && (
          <div className="flex flex-wrap justify-center gap-2 mt-4 p-4 border border-[#1E293B] bg-[#080D17]/80 rounded">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => selectColor(color)}
                className={`w-8 h-8 rounded-full ${color} border-2 transition-all ${
                  profile.avatarColor === color ? 'border-cyan-400 ring-2 ring-cyan-400/50' : 'border-transparent hover:border-slate-500'
                }`}
              />
            ))}
          </div>
        )}

        <h2 className="text-lg font-bold text-[#F3F4F6] mt-4 tracking-wide">
          {profile.displayName || 'Aegis Operator'}
        </h2>
        <p className="text-sm text-slate-500">{profile.email || 'operator@aegis.internal'}</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-[10px] uppercase text-slate-500 mb-2">
            <User className="h-3.5 w-3.5 inline mr-1" />
            Nome de Exibição
          </label>
          <input
            type="text"
            value={profile.displayName}
            onChange={(e) => handleChange('displayName', e.target.value)}
            placeholder="Digite seu nome"
            className="w-full bg-[#070A13] border border-[#1E293B] px-4 py-3 rounded text-sm text-[#F3F4F6] focus:outline-none focus:border-cyan-500/40 focus:bg-[#0C1322]"
          />
          <p className="text-[10px] text-slate-600 mt-1">
            Este nome será exibido no painel de controle
          </p>
        </div>

        <div>
          <label className="block text-[10px] uppercase text-slate-500 mb-2">
            <Mail className="h-3.5 w-3.5 inline mr-1" />
            Email
          </label>
          <input
            type="email"
            value={profile.email}
            onChange={(e) => handleChange('email', e.target.value)}
            placeholder="Digite seu email"
            className="w-full bg-[#070A13] border border-[#1E293B] px-4 py-3 rounded text-sm text-[#F3F4F6] focus:outline-none focus:border-cyan-500/40 focus:bg-[#0C1322]"
          />
          <p className="text-[10px] text-slate-600 mt-1">
            Email para notificações e identificação
          </p>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-cyan-900/40 border border-cyan-500/40 text-cyan-300 text-xs uppercase font-bold tracking-widest rounded disabled:opacity-50 hover:bg-cyan-900/60 transition-colors"
          >
            <Save className="h-3.5 w-3.5 inline mr-1" />
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
          {msg && (
            <span className={`text-xs ${msg.includes('sucesso') ? 'text-emerald-400' : 'text-red-400'}`}>
              {msg}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
