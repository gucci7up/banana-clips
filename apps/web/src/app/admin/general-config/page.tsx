'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/store';

export default function AdminGeneralConfigPage() {
  const [config, setConfig] = useState<any>({
    appName: 'BANANA CLIPS AI STUDIO',
    defaultLocale: 'es',
    maxUploadSizeMb: 4096,
    signedUrlTtlSeconds: 3600,
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch('/admin/overview').then((res) => {
      const gen = (res.settings || []).find((s: any) => s.key === 'general_config');
      if (gen?.valueJson) setConfig(gen.valueJson);
    });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/admin/settings/general_config', {
      method: 'PUT',
      body: JSON.stringify({ valueJson: config }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-extrabold">Configuración General del Sistema</h1>
      {saved && (
        <div className="rounded-xl bg-emerald-500/20 p-3 text-xs text-emerald-300">
          Configuración general actualizada.
        </div>
      )}
      <form onSubmit={handleSave} className="space-y-4 rounded-2xl border border-slate-800 bg-[#1B1E25] p-6 text-xs">
        <div>
          <label className="block font-semibold text-[#94A3B8]">Nombre de la Plataforma</label>
          <input
            type="text"
            value={config.appName}
            onChange={(e) => setConfig({ ...config, appName: e.target.value })}
            className="mt-1 w-full rounded-xl border border-slate-700 bg-[#111318] p-2.5"
          />
        </div>
        <div>
          <label className="block font-semibold text-[#94A3B8]">Tamaño Máximo de Subida Global (MB)</label>
          <input
            type="number"
            value={config.maxUploadSizeMb}
            onChange={(e) => setConfig({ ...config, maxUploadSizeMb: Number(e.target.value) })}
            className="mt-1 w-full rounded-xl border border-slate-700 bg-[#111318] p-2.5"
          />
        </div>
        <button type="submit" className="rounded-xl bg-[#FFD43B] px-5 py-2.5 font-bold text-[#111318]">
          Guardar Configuración General
        </button>
      </form>
    </div>
  );
}
