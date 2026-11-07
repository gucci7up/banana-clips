'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/store';
import { Radio, Play, Square, BookmarkPlus, Scissors } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function LiveClipperPage() {
  const router = useRouter();
  const [streamUrl, setStreamUrl] = useState('rtmp://ingest.bananaclips.local/live/canal_principal');
  const [title, setTitle] = useState('Transmisión RTMP en Directo');
  const [liveState, setLiveState] = useState<'IDLE' | 'CONNECTING' | 'RECORDING' | 'PROCESSING' | 'STOPPED' | 'FAILED'>('IDLE');
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [markers, setMarkers] = useState<number[]>([]);

  const loadSessions = async () => {
    const res = await apiFetch('/live');
    setSessions(res.sessions || []);
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const handleStartLive = async () => {
    setLiveState('CONNECTING');
    try {
      const res = await apiFetch<{ videoId: string; state: any }>('/live', {
        method: 'POST',
        body: JSON.stringify({ action: 'START', streamUrl, title }),
      });
      setActiveVideoId(res.videoId);
      setLiveState('RECORDING');
      await loadSessions();
    } catch {
      setLiveState('FAILED');
    }
  };

  const handleStopLive = async () => {
    if (!activeVideoId) return;
    const res = await apiFetch<{ state: any }>('/live', {
      method: 'POST',
      body: JSON.stringify({ action: 'STOP', videoId: activeVideoId }),
    });
    setLiveState(res.state || 'STOPPED');
    await loadSessions();
  };

  const handleSaveMoment = async () => {
    if (!activeVideoId) return;
    const ts = markers.length * 6 + 5;
    await apiFetch('/live', {
      method: 'POST',
      body: JSON.stringify({ action: 'MARK_MOMENT', videoId: activeVideoId, timestampSec: ts }),
    });
    setMarkers([...markers, ts]);
  };

  const handleGenerateClipFromLive = async (vidId: string) => {
    setLiveState('PROCESSING');
    await apiFetch('/jobs', {
      method: 'POST',
      body: JSON.stringify({
        videoId: vidId,
        jobType: 'AI_CLIPPING',
        targetDurationSec: 15,
        aspectRatio: '9:16',
        syncExecution: true,
      }),
    });
    router.push('/ai-clipping');
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-800 pb-4">
        <h1 className="text-2xl font-extrabold text-[#F8FAFC]">Live Clipper — Captura y Recorte en Directo</h1>
        <p className="text-xs text-[#94A3B8]">
          Soporta ingesta RTMP propia, segmentación continua FFmpeg y marcadores en tiempo real sobre transmisiones autorizadas
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 rounded-2xl border border-slate-800 bg-[#1B1E25] p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold">Estado de Grabación</span>
            <span className="rounded-full bg-[#FFD43B]/20 px-3 py-1 text-xs font-extrabold text-[#FFD43B]">
              {liveState}
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#94A3B8]">Endpoint RTMP / HLS Autorizado</label>
            <input
              type="text"
              value={streamUrl}
              onChange={(e) => setStreamUrl(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-[#111318] p-2.5 text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#94A3B8]">Título de la sesión</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-[#111318] p-2.5 text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              type="button"
              onClick={handleStartLive}
              disabled={liveState === 'RECORDING'}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-slate-950 disabled:opacity-40"
            >
              <Play className="h-4 w-4" /> Iniciar
            </button>
            <button
              type="button"
              onClick={handleStopLive}
              disabled={liveState !== 'RECORDING'}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-red-500 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40"
            >
              <Square className="h-4 w-4" /> Detener
            </button>
            <button
              type="button"
              onClick={handleSaveMoment}
              disabled={!activeVideoId}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-[#FFD43B] px-4 py-2.5 text-xs font-bold text-[#FFD43B] disabled:opacity-40"
            >
              <BookmarkPlus className="h-4 w-4" /> Guardar Momento
            </button>
            <button
              type="button"
              onClick={() => activeVideoId && handleGenerateClipFromLive(activeVideoId)}
              disabled={!activeVideoId}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-[#FFD43B] px-4 py-2.5 text-xs font-bold text-[#111318] disabled:opacity-40"
            >
              <Scissors className="h-4 w-4" /> Generar Clip
            </button>
          </div>
        </div>

        <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-[#1B1E25] p-5">
          <h2 className="mb-3 text-base font-bold">Grabaciones Progresivas y Sesiones RTMP</h2>
          <div className="space-y-3">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-[#111318] p-3.5 text-xs"
              >
                <div>
                  <div className="font-bold text-sm text-[#F8FAFC]">{s.title}</div>
                  <div className="text-[#94A3B8]">
                    Protocolo: {s.protocol} • Origen: {s.originUrl} • Estado: {s.liveStreamState}
                  </div>
                </div>
                <button
                  onClick={() => handleGenerateClipFromLive(s.id)}
                  className="rounded-lg bg-[#FFD43B] px-3 py-1.5 font-bold text-[#111318]"
                >
                  Generar Clips de Grabación
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
