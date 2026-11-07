'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/store';

export default function AdminAiConfigPage() {
  const [config, setConfig] = useState<any>({
    hardwareProfile: 'NVIDIA_LOW_VRAM',
    whisperModel: 'small',
    computeType: 'int8',
    unloadModelsAfterJob: true,
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch('/admin/overview').then((res) => {
      const ai = (res.settings || []).find((s: any) => s.key === 'ai_config');
      if (ai?.valueJson) setConfig(ai.valueJson);
    });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/admin/settings/ai_config', {
      method: 'PUT',
      body: JSON.stringify({ valueJson: config }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-extrabold">Configuración de IA y Perfiles de Hardware</h1>
      {saved && (
        <div className="rounded-xl bg-emerald-500/20 p-3 text-xs text-emerald-300">
          Configuración de IA guardada en PostgreSQL.
        </div>
      )}
      <form onSubmit={handleSave} className="space-y-4 rounded-2xl border border-slate-800 bg-[#1B1E25] p-6 text-xs">
        <div>
          <label className="block font-semibold text-[#94A3B8]">Perfil de Hardware</label>
          <select
            value={config.hardwareProfile}
            onChange={(e) => setConfig({ ...config, hardwareProfile: e.target.value })}
            className="mt-1 w-full rounded-xl border border-slate-700 bg-[#111318] p-2.5"
          >
            <option value="CPU_ONLY">CPU_ONLY (Universal Fallback)</option>
            <option value="NVIDIA_LOW_VRAM">NVIDIA_LOW_VRAM (GPU 4GB - 8GB VRAM, Cuantización INT8)</option>
            <option value="NVIDIA_HIGH_VRAM">NVIDIA_HIGH_VRAM (GPU 12GB+ VRAM, FP16)</option>
          </select>
        </div>
        <div>
          <label className="block font-semibold text-[#94A3B8]">Tamaño de Modelo Faster-Whisper</label>
          <select
            value={config.whisperModel}
            onChange={(e) => setConfig({ ...config, whisperModel: e.target.value })}
            className="mt-1 w-full rounded-xl border border-slate-700 bg-[#111318] p-2.5"
          >
            <option value="tiny">tiny</option>
            <option value="base">base</option>
            <option value="small">small</option>
            <option value="medium">medium</option>
            <option value="large-v3-turbo">large-v3-turbo</option>
          </select>
        </div>
        <button type="submit" className="rounded-xl bg-[#FFD43B] px-5 py-2.5 font-bold text-[#111318]">
          Guardar Configuración IA
        </button>
      </form>
    </div>
  );
}
