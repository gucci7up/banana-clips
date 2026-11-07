'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/store';
import { Layers, Plus, CheckSquare } from 'lucide-react';

const MONTAGE_TEMPLATES = [
  'Gaming Compilation',
  'Podcast Highlights',
  'Funny Moments',
  'Best of Stream',
  'Educational Recap',
];

export default function AiMontagePage() {
  const [clips, setClips] = useState<any[]>([]);
  const [montages, setMontages] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [templateName, setTemplateName] = useState(MONTAGE_TEMPLATES[0]);
  const [titleOverlay, setTitleOverlay] = useState('');
  const [selectedClipIds, setSelectedClipIds] = useState<string[]>([]);

  const loadAll = async () => {
    const [cRes, mRes] = await Promise.all([
      apiFetch<{ clips: any[] }>('/clips'),
      apiFetch<{ montages: any[] }>('/montages'),
    ]);
    setClips(cRes.clips || []);
    setMontages(mRes.montages || []);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const toggleClip = (id: string) => {
    setSelectedClipIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleCreateMontage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || selectedClipIds.length === 0) return;
    await apiFetch('/montages', {
      method: 'POST',
      body: JSON.stringify({
        name,
        templateName,
        titleOverlay,
        clipIds: selectedClipIds,
      }),
    });
    setName('');
    setSelectedClipIds([]);
    await loadAll();
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-800 pb-4">
        <h1 className="text-2xl font-extrabold text-[#F8FAFC]">AI Montage — Combinación de Clips</h1>
        <p className="text-xs text-[#94A3B8]">
          Combina múltiples clips con transiciones, títulos, subtítulos y plantillas editables
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <form
          onSubmit={handleCreateMontage}
          className="space-y-4 rounded-2xl border border-slate-800 bg-[#1B1E25] p-5"
        >
          <h2 className="text-base font-bold text-[#FFD43B]">Crear Nuevo Montaje</h2>
          <div>
            <label className="block text-xs font-semibold text-[#94A3B8]">Nombre del Montaje</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Lo Mejor de la Semana #1"
              className="mt-1 w-full rounded-xl border border-slate-700 bg-[#111318] p-2.5 text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#94A3B8]">Plantilla de Montaje</label>
            <select
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-[#111318] p-2.5 text-xs"
            >
              {MONTAGE_TEMPLATES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#94A3B8]">Título de Apertura</label>
            <input
              type="text"
              value={titleOverlay}
              onChange={(e) => setTitleOverlay(e.target.value)}
              placeholder="TOP MOMENTOS"
              className="mt-1 w-full rounded-xl border border-slate-700 bg-[#111318] p-2.5 text-xs"
            />
          </div>

          <button
            type="submit"
            disabled={selectedClipIds.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FFD43B] px-5 py-2.5 text-xs font-bold text-[#111318] disabled:opacity-40"
          >
            <Plus className="h-4 w-4" /> Guardar y Renderizar Montaje ({selectedClipIds.length} clips)
          </button>
        </form>

        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-[#1B1E25] p-5">
            <h2 className="mb-3 text-base font-bold">Seleccionar Clips para el Montaje</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {clips.map((c) => (
                <div
                  key={c.id}
                  onClick={() => toggleClip(c.id)}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 text-xs ${
                    selectedClipIds.includes(c.id)
                      ? 'border-[#FFD43B] bg-[#FFD43B]/15'
                      : 'border-slate-800 bg-[#111318]'
                  }`}
                >
                  <div>
                    <div className="font-bold">{c.title}</div>
                    <div className="text-[#94A3B8]">{c.durationSec}s • Score {c.scoreTotal}/100</div>
                  </div>
                  <CheckSquare className="h-4 w-4 text-[#FFD43B]" />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#1B1E25] p-5">
            <h2 className="mb-3 text-base font-bold">Montajes Guardados ({montages.length})</h2>
            <div className="space-y-2">
              {montages.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-xl border border-slate-800 bg-[#111318] p-3 text-xs">
                  <div>
                    <div className="font-bold text-sm">{m.name}</div>
                    <div className="text-[#94A3B8]">Plantilla: {m.templateName} • Formato: {m.aspectRatio}</div>
                  </div>
                  <span className="rounded bg-emerald-500/20 px-2.5 py-1 font-bold text-emerald-400">{m.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
