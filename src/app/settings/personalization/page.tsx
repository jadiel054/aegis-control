'use client';

import React, { useEffect, useState } from 'react';
import { Palette, RefreshCw, Save, Clock, Eye, EyeOff } from 'lucide-react';

interface PersonalizationSettings {
  accentColor: string;
  density: 'compact' | 'comfortable' | 'default';
  fontSize: 'small' | 'medium' | 'large';
  pollingEnabled: boolean;
  pollingInterval: number;
  showTimestamps: boolean;
  darkMode: boolean;
}

const PRESET_COLORS = [
  { value: 'cyan', label: 'Ciano', class: 'bg-cyan-500' },
  { value: 'emerald', label: 'Esmeralda', class: 'bg-emerald-500' },
  { value: 'amber', label: 'Âmbar', class: 'bg-amber-500' },
  { value: 'purple', label: 'Roxo', class: 'bg-purple-500' },
  { value: 'rose', label: 'Rosa', class: 'bg-rose-500' },
  { value: 'indigo', label: 'Índigo', class: 'bg-indigo-500' },
  { value: 'teal', label: 'Verde-Azulado', class: 'bg-teal-500' },
  { value: 'pink', label: 'Rosa', class: 'bg-pink-500' },
];

const DENSITY_OPTIONS = [
  { value: 'compact' as const, label: 'Compacto' },
  { value: 'default' as const, label: 'Padrão' },
  { value: 'comfortable' as const, label: 'Confortável' },
];

const FONT_SIZE_OPTIONS = [
  { value: 'small' as const, label: 'Pequeno' },
  { value: 'medium' as const, label: 'Médio' },
  { value: 'large' as const, label: 'Grande' },
];

const POLLING_INTERVALS = [
  { value: 5, label: '5 segundos' },
  { value: 8, label: '8 segundos' },
  { value: 10, label: '10 segundos' },
  { value: 15, label: '15 segundos' },
  { value: 30, label: '30 segundos' },
  { value: 60, label: '1 minuto' },
];

export default function PersonalizationSettingsPage() {
  const [settings, setSettings] = useState<PersonalizationSettings>({
    accentColor: 'cyan',
    density: 'default',
    fontSize: 'medium',
    pollingEnabled: true,
    pollingInterval: 10,
    showTimestamps: true,
    darkMode: true,
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('aegis-personalization');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSettings({
          accentColor: parsed.accentColor || 'cyan',
          density: parsed.density || 'default',
          fontSize: parsed.fontSize || 'medium',
          pollingEnabled: parsed.pollingEnabled !== false,
          pollingInterval: parsed.pollingInterval || 10,
          showTimestamps: parsed.showTimestamps !== false,
          darkMode: parsed.darkMode !== false,
        });
      } catch (error) {
        console.error('Failed to parse personalization:', error);
      }
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.remove('polling-enabled', 'polling-disabled');
    document.documentElement.classList.add(settings.pollingEnabled ? 'polling-enabled' : 'polling-disabled');
  }, [settings.pollingEnabled]);

  const handleChange = (field: keyof PersonalizationSettings, value: string | number | boolean) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
    setMsg(null);
  };

  const handleSave = () => {
    setSaving(true);
    setMsg(null);

    try {
      localStorage.setItem('aegis-personalization', JSON.stringify(settings));
      setMsg('Preferências salvas com sucesso');
    } catch (error) {
      setMsg('Erro ao salvar preferências');
      console.error('Failed to save personalization:', error);
    } finally {
      setSaving(false);
    }
  };

  const getAccentPreview = () => {
    const color = PRESET_COLORS.find((c) => c.value === settings.accentColor);
    return color?.class || 'bg-cyan-500';
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="border border-[#1E293B] bg-[#080D17]/80 rounded p-6">
        <div className="flex items-center gap-2 mb-4">
          <Palette className="h-5 w-5 text-cyan-400" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-[#F3F4F6]">
            Aparência
          </h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-[10px] uppercase text-slate-500 mb-2">
              Cor de Destaque
            </label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color.value}
                  onClick={() => handleChange('accentColor', color.value)}
                  className={`w-8 h-8 rounded ${color.class} border-2 transition-all ${
                    settings.accentColor === color.value
                      ? 'border-cyan-400 ring-2 ring-cyan-400/50'
                      : 'border-transparent hover:border-slate-500'
                  }`}
                />
              ))}
            </div>
            <p className="text-[10px] text-slate-600 mt-2">
              Cor principal usada em botões, ícones e destaques
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] uppercase text-slate-500 mb-2">
                Densidade
              </label>
              <select
                value={settings.density}
                onChange={(e) => handleChange('density', e.target.value as 'compact' | 'comfortable' | 'default')}
                className="w-full bg-[#070A13] border border-[#1E293B] px-3 py-2 rounded text-sm text-[#F3F4F6] focus:outline-none focus:border-cyan-500/40 focus:bg-[#0C1322]"
              >
                {DENSITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-600 mt-1">
                Espaçamento entre elementos
              </p>
            </div>

            <div>
              <label className="block text-[10px] uppercase text-slate-500 mb-2">
                Tamanho da Fonte
              </label>
              <select
                value={settings.fontSize}
                onChange={(e) => handleChange('fontSize', e.target.value as 'small' | 'medium' | 'large')}
                className="w-full bg-[#070A13] border border-[#1E293B] px-3 py-2 rounded text-sm text-[#F3F4F6] focus:outline-none focus:border-cyan-500/40 focus:bg-[#0C1322]"
              >
                {FONT_SIZE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-600 mt-1">
                Tamanho base da fonte
              </p>
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-[10px] uppercase text-slate-500 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.darkMode}
                onChange={(e) => handleChange('darkMode', e.target.checked)}
                className="w-4 h-4 accent-cyan-500"
              />
              <span>Modo Escuro</span>
            </label>
            <p className="text-[10px] text-slate-600 mt-1">
              Ativar/desativar tema escuro
            </p>
          </div>
        </div>
      </div>

      <div className="border border-[#1E293B] bg-[#080D17]/80 rounded p-6">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="h-5 w-5 text-cyan-400" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-[#F3F4F6]">
            Atualização Automática
          </h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="flex items-center gap-2 text-[10px] uppercase text-slate-500 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.pollingEnabled}
                onChange={(e) => handleChange('pollingEnabled', e.target.checked)}
                className="w-4 h-4 accent-cyan-500"
              />
              <span>Ativar Polling Automático</span>
            </label>
            <p className="text-[10px] text-slate-600 mt-1">
              Atualizar dados automaticamente em intervalos regulares
            </p>
          </div>

          {settings.pollingEnabled && (
            <div>
              <label className="block text-[10px] uppercase text-slate-500 mb-2">
                Intervalo de Polling
              </label>
              <select
                value={settings.pollingInterval}
                onChange={(e) => handleChange('pollingInterval', Number(e.target.value))}
                className="w-full bg-[#070A13] border border-[#1E293B] px-3 py-2 rounded text-sm text-[#F3F4F6] focus:outline-none focus:border-cyan-500/40 focus:bg-[#0C1322]"
              >
                {POLLING_INTERVALS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-600 mt-1">
                Frequência de atualização automática dos dados
              </p>
            </div>
          )}

          <div>
            <label className="flex items-center gap-2 text-[10px] uppercase text-slate-500 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.showTimestamps}
                onChange={(e) => handleChange('showTimestamps', e.target.checked)}
                className="w-4 h-4 accent-cyan-500"
              />
              <span>Exibir Timestamps</span>
            </label>
            <p className="text-[10px] text-slate-600 mt-1">
              Mostrar horários em mensagens e logs
            </p>
          </div>
        </div>
      </div>

      <div className="border border-[#1E293B] bg-[#080D17]/80 rounded p-6">
        <div className="flex items-center gap-2 mb-4">
          <Eye className="h-5 w-5 text-cyan-400" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-[#F3F4F6]">
            Visualização
          </h2>
        </div>

        <div className="space-y-4">
          <div className="border border-[#1E293B] bg-[#070B13] rounded p-4">
            <p className="text-[10px] uppercase text-slate-500 mb-3">
              Preview da Cor de Destaque
            </p>
            <div className="flex items-center gap-4">
              <div className={`w-16 h-16 rounded ${getAccentPreview()} flex items-center justify-center`}>
                <span className="text-2xl font-bold text-white">AO</span>
              </div>
              <div>
                <p className="text-sm text-[#F3F4F6]">
                  Cor atual: {PRESET_COLORS.find((c) => c.value === settings.accentColor)?.label || 'Ciano'}
                </p>
                <p className="text-[10px] text-slate-500">
                  Código: {getAccentPreview()}
                </p>
              </div>
            </div>
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

      <p className="text-[10px] text-slate-600">
        <Eye className="h-3 w-3 inline mr-1" />
        Nota: Estas preferências são salvas localmente no seu navegador.
        Elas não afetam outros dispositivos ou usuários.
      </p>
    </div>
  );
}
