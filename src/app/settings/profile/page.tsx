'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { User, Mail, Image as ImageIcon, Save, Camera, Upload, X } from 'lucide-react';

interface ProfileData {
  displayName: string;
  email: string;
  avatarUrl: string | null;
  avatarInitials: string;
  avatarColor: string;
}

const PRESET_COLORS = [
  { value: 'bg-cyan-500', label: 'Ciano', color: '#06B6D4' },
  { value: 'bg-emerald-500', label: 'Esmeralda', color: '#10B981' },
  { value: 'bg-amber-500', label: 'Âmbar', color: '#F59E0B' },
  { value: 'bg-purple-500', label: 'Roxo', color: '#8B5CF6' },
  { value: 'bg-rose-500', label: 'Rosa', color: '#F43F5E' },
  { value: 'bg-indigo-500', label: 'Índigo', color: '#6366F1' },
  { value: 'bg-teal-500', label: 'Verde-Azulado', color: '#14B8A6' },
  { value: 'bg-pink-500', label: 'Rosa Claro', color: '#EC4899' },
];

const DEFAULT_AVATAR_COLOR = 'bg-cyan-500';
const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export default function ProfileSettingsPage() {
  const [profile, setProfile] = useState<ProfileData>({
    displayName: '',
    email: '',
    avatarUrl: null,
    avatarInitials: '',
    avatarColor: DEFAULT_AVATAR_COLOR,
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Improved initials generation
  const getInitials = useCallback((name: string): string => {
    if (!name || !name.trim()) {
      return 'AO';
    }
    
    // Clean the name: remove special characters and extra spaces
    const cleaned = name.trim().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ');
    const parts = cleaned.split(' ');
    
    // If only one word, take first 2 letters
    if (parts.length === 1) {
      const word = parts[0];
      if (word.length >= 2) {
        return word.slice(0, 2).toUpperCase();
      }
      return word.toUpperCase().padEnd(2, word[0] || 'A');
    }
    
    // Multiple words: take first letter of first and last word
    const firstInitial = parts[0][0]?.toUpperCase() || 'A';
    const lastInitial = parts[parts.length - 1][0]?.toUpperCase() || 'O';
    
    return firstInitial + lastInitial;
  }, []);

  // Load profile from API
  const loadProfile = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/operator/profile');
      
      if (!response.ok) {
        throw new Error('Failed to load profile');
      }
      
      const data = await response.json();
      
      setProfile({
        displayName: data.display_name || 'Aegis Operator',
        email: data.email || 'operator@aegis.internal',
        avatarUrl: data.avatar_url || null,
        avatarInitials: data.avatar_initials || getInitials(data.display_name || 'Aegis Operator'),
        avatarColor: data.avatar_color || DEFAULT_AVATAR_COLOR,
      });
    } catch (err) {
      console.error('Failed to load profile:', err);
      setError('Erro ao carregar perfil. Usando valores padrão.');
      
      // Use defaults
      setProfile({
        displayName: 'Aegis Operator',
        email: 'operator@aegis.internal',
        avatarUrl: null,
        avatarInitials: 'AO',
        avatarColor: DEFAULT_AVATAR_COLOR,
      });
    } finally {
      setIsLoading(false);
    }
  }, [getInitials]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleChange = useCallback((field: keyof ProfileData, value: string) => {
    setProfile((prev) => {
      const newProfile = { ...prev, [field]: value };
      if (field === 'displayName') {
        newProfile.avatarInitials = getInitials(value);
      }
      return newProfile;
    });
    setMsg(null);
    setError(null);
  }, [getInitials]);

  const handleColorSelect = useCallback((color: string) => {
    setProfile((prev) => ({ ...prev, avatarColor: color }));
    setShowColorPicker(false);
    setMsg(null);
  }, []);

  const handleAvatarUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    
    if (!file) {
      return;
    }

    // Validate file type
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setError('Formato de imagem não suportado. Use JPEG, PNG, WebP ou GIF.');
      return;
    }

    // Validate file size
    if (file.size > MAX_AVATAR_SIZE) {
      setError('Imagem muito grande. Máximo 2MB.');
      return;
    }

    setError(null);
    setMsg('Processando imagem...');

    try {
      // Create a preview URL
      const previewUrl = URL.createObjectURL(file);
      setProfile((prev) => ({ ...prev, avatarUrl: previewUrl }));
      setMsg('Imagem carregada. Clique em Salvar para confirmar.');
    } catch (err) {
      setError('Erro ao processar imagem.');
      console.error('Failed to process avatar:', err);
    }
  }, []);

  const handleRemoveAvatar = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setProfile((prev) => ({ ...prev, avatarUrl: null }));
    setMsg('Avatar removido.');
  }, []);

  const handleSave = useCallback(async () => {
    if (!profile.displayName.trim() || !profile.email.trim()) {
      setError('Nome de exibição e email são obrigatórios.');
      return;
    }

    setSaving(true);
    setMsg(null);
    setError(null);

    try {
      // Prepare data for API
      const saveData = {
        display_name: profile.displayName.trim(),
        email: profile.email.trim(),
        avatar_url: profile.avatarUrl || null,
        avatar_initials: profile.avatarInitials,
        avatar_color: profile.avatarColor,
      };

      const response = await fetch('/api/operator/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(saveData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Erro ao salvar perfil');
      }

      const result = await response.json();
      setMsg('Perfil salvo com sucesso no banco de dados!');
      
      // Reload to get fresh data from server
      await loadProfile();
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar perfil.');
      console.error('Failed to save profile:', err);
    } finally {
      setSaving(false);
    }
  }, [profile, loadProfile]);

  const getAvatarDisplay = useCallback(() => {
    if (profile.avatarUrl) {
      return (
        <img
          src={profile.avatarUrl}
          alt="Avatar"
          className="w-24 h-24 rounded-full object-cover border-4 border-[#0A0F1D] shadow-lg"
        />
      );
    }

    return (
      <div
        className={`w-24 h-24 rounded-full ${profile.avatarColor} flex items-center justify-center text-2xl font-bold text-white border-4 border-[#0A0F1D] shadow-lg`}
      >
        {profile.avatarInitials}
      </div>
    );
  }, [profile.avatarUrl, profile.avatarColor, profile.avatarInitials]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="text-center">
        <div className="relative inline-block">
          {getAvatarDisplay()}
          
          <div className="flex gap-2 mt-4 justify-center">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-2 bg-[#0A0F1D]/80 border border-[#1E293B] text-slate-300 text-xs uppercase font-bold tracking-wider rounded hover:bg-[#121A2E] hover:border-cyan-500/40 transition-colors flex items-center gap-1"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload
            </button>
            
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleAvatarUpload}
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
            />

            {profile.avatarUrl && (
              <button
                onClick={handleRemoveAvatar}
                className="px-3 py-2 bg-red-950/20 border border-red-500/30 text-red-400 text-xs uppercase font-bold tracking-wider rounded hover:bg-red-950/40 transition-colors flex items-center gap-1"
              >
                <X className="h-3.5 w-3.5" />
                Remover
              </button>
            )}
          </div>

          <button
            onClick={() => setShowColorPicker(!showColorPicker)}
            className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 border border-[#1E293B] text-slate-300 text-xs uppercase font-bold tracking-wider rounded hover:bg-[#121A2E] hover:border-cyan-500/40 transition-colors"
          >
            <Camera className="h-3.5 w-3.5" />
            Cor do Avatar
          </button>
        </div>

        {showColorPicker && (
          <div className="flex flex-wrap justify-center gap-2 mt-4 p-4 border border-[#1E293B] bg-[#080D17]/80 rounded">
            {PRESET_COLORS.map((color) => (
              <button
                key={color.value}
                onClick={() => handleColorSelect(color.value)}
                className={`w-8 h-8 rounded-full ${color.value} border-2 transition-all ${
                  profile.avatarColor === color.value
                    ? 'border-cyan-400 ring-2 ring-cyan-400/50'
                    : 'border-transparent hover:border-slate-500'
                }`}
                title={color.label}
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
            Este nome será exibido no painel de controle. Iniciais: {profile.avatarInitials}
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
            className="px-4 py-2 bg-cyan-900/40 border border-cyan-500/40 text-cyan-300 text-xs uppercase font-bold tracking-widest rounded disabled:opacity-50 hover:bg-cyan-900/60 transition-colors flex items-center gap-1"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Salvando...' : 'Salvar no Neon'}
          </button>
          {msg && (
            <span className="text-xs text-emerald-400">{msg}</span>
          )}
          {error && (
            <span className="text-xs text-red-400">{error}</span>
          )}
        </div>
      </div>

      <div className="border border-[#1E293B] bg-[#080D17]/80 rounded p-4">
        <h3 className="text-xs uppercase tracking-widest text-slate-400 mb-3">
          Informações
        </h3>
        <p className="text-[10px] text-slate-500 leading-relaxed">
          ✅ Perfil salvo no banco de dados Neon<br />
          ✅ Persistência entre dispositivos<br />
          ✅ Upload de avatar (máx. 2MB)<br />
          ✅ Geração automática de iniciais<br />
          ✅ Seleção de cor personalizada
        </p>
      </div>
    </div>
  );
}
