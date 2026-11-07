'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/store';
import { Gamepad2, Zap, Volume2, Eye, CheckSquare } from 'lucide-react';

export default function GameClippingPage() {
  const [data, setData] = useState<any>(null);
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [selectedGame, setSelectedGame] = useState<string>('fortnite');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);

  const loadGaming = async (preset = '') => {
    const q = preset ? `?preset=${encodeURIComponent(preset)}` : '';
    const res = await apiFetch(`/gaming${q}`);
    setData(res);
  };

  useEffect(() => {
    loadGaming(selectedPreset);
  }, [selectedPreset]);

  const toggleEvent = (id: string) => {
    setSelectedEvents((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-800 pb-4">
        <h1 className="text-2xl font-extrabold text-[#F8FAFC]">Game Clipping — Motor Especializado Gaming</h1>
        <p className="text-xs text-[#94A3B8]">
          Detectores modulares intercambiables mediante picos de audio, acción visual, cambios en HUD y reacciones del streamer
        </p>
      </div>

      {/* Games & Presets Selector */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-[#1B1E25] p-4">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-[#FFD43B]">
            Módulos Detectores por Videojuego
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {(data?.supportedGames || []).map((g: any) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setSelectedGame(g.id)}
                className={`rounded-xl border p-2.5 text-left text-xs transition ${
                  selectedGame === g.id
                    ? 'border-[#FFD43B] bg-[#FFD43B]/15 text-[#F8FAFC]'
                    : 'border-slate-800 bg-[#111318] text-[#94A3B8]'
                }`}
              >
                <div className="font-bold">{g.name}</div>
                <div className="text-[10px] text-[#94A3B8]">{g.detectorMode}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-[#1B1E25] p-4">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-[#FFD43B]">
            Presets de Momentos Gaming
          </h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedPreset('')}
              className={`rounded-xl px-3 py-2 text-xs font-bold ${
                selectedPreset === '' ? 'bg-[#FFD43B] text-[#111318]' : 'bg-[#111318] text-[#94A3B8]'
              }`}
            >
              Todos
            </button>
            {(data?.presets || []).map((preset: string) => (
              <button
                key={preset}
                type="button"
                onClick={() => setSelectedPreset(preset)}
                className={`rounded-xl px-3 py-2 text-xs font-bold ${
                  selectedPreset === preset ? 'bg-[#FFD43B] text-[#111318]' : 'bg-[#111318] text-[#94A3B8]'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-[#94A3B8]">
            Nota técnica: Para juegos sin OCR de HUD validado específicamente, el motor aplica análisis multimodal general (audio + movimiento) e informa el nivel de confianza real.
          </p>
        </div>
      </div>

      {/* Interactive Event Timeline Markers */}
      <div className="rounded-2xl border border-slate-800 bg-[#1B1E25] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold">Timeline con Marcadores de Eventos Detectados</h2>
          <span className="text-xs text-[#FFD43B]">
            {selectedEvents.length} eventos seleccionados para combinar
          </span>
        </div>

        {(data?.events || []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-xs text-[#94A3B8]">
            Procesa un video en AI Clipping para visualizar sus marcadores de acción gaming en el timeline.
          </div>
        ) : (
          <div className="space-y-3">
            {data.events.map((ev: any) => (
              <div
                key={ev.id}
                onClick={() => toggleEvent(ev.id)}
                className={`flex cursor-pointer items-center justify-between rounded-xl border p-3.5 transition ${
                  selectedEvents.includes(ev.id)
                    ? 'border-[#FFD43B] bg-[#FFD43B]/10'
                    : 'border-slate-800 bg-[#111318]'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="rounded bg-[#FFB703] px-2 py-0.5 font-black text-[#111318]">
                      {ev.presetTag || 'Highlights'}
                    </span>
                    <span className="font-bold text-[#FFD43B]">{ev.eventType}</span>
                    <span className="text-[#94A3B8]">
                      Timestamp: {ev.timestampSec}s (Duración: {ev.durationSec}s)
                    </span>
                    <span className="text-emerald-400 font-semibold">
                      Confianza: {Math.round((ev.confidence || 0.85) * 100)}%
                    </span>
                  </div>
                  <div className="text-sm text-[#F8FAFC]">{ev.description}</div>
                </div>
                <CheckSquare
                  className={`h-5 w-5 ${
                    selectedEvents.includes(ev.id) ? 'text-[#FFD43B]' : 'text-slate-600'
                  }`}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
