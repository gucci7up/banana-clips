'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/store';
import {
  Radio,
  Play,
  Square,
  Zap,
  Scissors,
  Download,
  Edit3,
  Loader2,
  FolderKanban,
  CheckCircle2,
  Youtube,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function LiveClipperPage() {
  const router = useRouter();
  const [streamUrl, setStreamUrl] = useState('https://www.youtube.com/watch?v=jfKfPfyJRdk');
  const [title, setTitle] = useState('Directo de YouTube En Vivo');
  const [clipDurationSec, setClipDurationSec] = useState<number>(20);
  const [intervalSec, setIntervalSec] = useState<number>(600);
  const [autoCutEnabled, setAutoCutEnabled] = useState<boolean>(true);

  const [liveState, setLiveState] = useState<'IDLE' | 'CONNECTING' | 'RECORDING' | 'PROCESSING' | 'STOPPED' | 'FAILED'>('IDLE');
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [liveClips, setLiveClips] = useState<any[]>([]);

  const loadSessions = async () => {
    try {
      const res = await apiFetch<{ sessions: any[]; liveClips: any[] }>('/live');
      const sessList = res.sessions || [];
      setSessions(sessList);
      setLiveClips(res.liveClips || []);

      const active = sessList.find((s: any) => s.liveStreamState === 'RECORDING');
      if (active) {
        setActiveVideoId(active.id);
        setLiveState('RECORDING');
        if (active.originUrl && streamUrl === 'https://www.youtube.com/watch?v=jfKfPfyJRdk') {
          setStreamUrl(active.originUrl);
          setTitle(active.title || 'Directo En Vivo');
        }
      }
    } catch {}
  };

  useEffect(() => {
    loadSessions();
    const poll = setInterval(loadSessions, 2500);
    return () => clearInterval(poll);
  }, []);

  const handleStartLive = async () => {
    if (!streamUrl.trim()) return;
    setLiveState('CONNECTING');
    try {
      const res = await apiFetch<{ videoId: string; state: any }>('/live', {
        method: 'POST',
        body: JSON.stringify({
          action: 'START',
          streamUrl: streamUrl.trim(),
          title: title.trim() || 'Directo En Vivo',
          clipDurationSec,
          intervalSec,
          autoCutEnabled,
        }),
      });
      setActiveVideoId(res.videoId);
      setLiveState('RECORDING');
      await loadSessions();
    } catch {
      setLiveState('FAILED');
    }
  };

  const handleCaptureCutNow = async (targetVidId?: string) => {
    const vid = targetVidId || activeVideoId;
    if (!vid) return;
    await apiFetch('/live', {
      method: 'POST',
      body: JSON.stringify({
        action: 'CAPTURE_NOW',
        videoId: vid,
        clipDurationSec,
      }),
    });
    await loadSessions();
  };

  const handleStopLive = async (targetVidId?: string) => {
    const vid = targetVidId || activeVideoId;
    if (!vid) return;
    const res = await apiFetch<{ state: any }>('/live', {
      method: 'POST',
      body: JSON.stringify({ action: 'STOP', videoId: vid }),
    });
    setLiveState(res.state || 'STOPPED');
    await loadSessions();
  };

  const activeSession = sessions.find((s) => s.id === activeVideoId) || sessions[0];

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-3 py-0.5 text-[11px] font-extrabold text-red-400 border border-red-500/30">
              <Radio className="h-3.5 w-3.5 animate-pulse" /> YouTube Live / Twitch / HLS / RTMP Auto-Cutter
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-extrabold text-[#F8FAFC]">
            Live Clipper — Auto-Recorte de Directos de YouTube en Tiempo Real
          </h1>
          <p className="text-xs text-[#94A3B8]">
            Pega el enlace de cualquier directo en vivo de YouTube: el servidor irá sacando cortes verticales 9:16 con subtítulos Faster-Whisper y guardándolos automáticamente en Mi Biblioteca (Galería Persistente)
          </p>
        </div>

        <Link
          href="/library"
          className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-[#1B1E25] px-4 py-2 text-xs font-bold text-[#FFD43B] hover:border-[#FFD43B]"
        >
          <FolderKanban className="h-4 w-4" /> Ver Todo en Mi Biblioteca ({liveClips.length} cortes en vivo)
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* LEFT COLUMN (5 cols): Live Stream Controller */}
        <div className="studio-card space-y-4 p-4 sm:p-5 lg:col-span-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-white">1. Conectar Directo En Vivo</span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-extrabold ${
                liveState === 'RECORDING'
                  ? 'bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse'
                  : 'bg-[#FFD43B]/20 text-[#FFD43B]'
              }`}
            >
              {liveState === 'RECORDING' ? '🔴 CAPTURANDO EN VIVO' : liveState}
            </span>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-[#94A3B8]">
              <Youtube className="h-4 w-4 text-red-500" /> URL del Directo de YouTube / Twitch / HLS / RTMP
            </label>
            <input
              type="text"
              value={streamUrl}
              onChange={(e) => setStreamUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=... o https://www.youtube.com/live/..."
              className="mt-1 w-full rounded-xl border border-slate-700 bg-[#0B0D12] p-2.5 text-xs text-white focus:border-[#FFD43B] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#94A3B8]">Título del Directo / Canal</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-[#0B0D12] p-2.5 text-xs text-white focus:border-[#FFD43B] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-[#94A3B8]">Duración de cada Corte</label>
              <select
                value={clipDurationSec}
                onChange={(e) => setClipDurationSec(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-[#111318] p-2.5 text-xs font-bold text-white"
              >
                <option value={15}>15 segundos (Short rápido)</option>
                <option value={20}>20 segundos (Recomendado)</option>
                <option value={30}>30 segundos (Completo)</option>
                <option value={45}>45 segundos (Extendido)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#94A3B8]">Bloque de Análisis del Live</label>
              <select
                value={autoCutEnabled ? String(intervalSec) : 'MANUAL'}
                onChange={(e) => {
                  if (e.target.value === 'MANUAL') {
                    setAutoCutEnabled(false);
                  } else {
                    setAutoCutEnabled(true);
                    setIntervalSec(Number(e.target.value));
                  }
                }}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-[#111318] p-2.5 text-xs font-bold text-white"
              >
                <option value="600">⭐ Bloques de 10 Minutos (Saca de 2 a 3 Mejores Cortes c/10m)</option>
                <option value="300">Bloques de 5 Minutos (Saca de 2 a 3 Mejores Cortes c/5m)</option>
                <option value="900">Bloques de 15 Minutos (Saca de 2 a 3 Mejores Cortes c/15m)</option>
                <option value="60">Modo Rápido: Bloques de 1 Minuto</option>
                <option value="MANUAL">Solo Manual al pulsar el botón</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 pt-2">
            <button
              type="button"
              onClick={handleStartLive}
              disabled={liveState === 'RECORDING' || liveState === 'CONNECTING'}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-3 text-xs font-black text-slate-950 shadow hover:bg-emerald-400 disabled:opacity-40"
            >
              <Play className="h-4 w-4" /> Iniciar Auto-Corte
            </button>
            <button
              type="button"
              onClick={() => handleStopLive()}
              disabled={liveState !== 'RECORDING'}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-red-500 px-4 py-3 text-xs font-black text-white shadow hover:bg-red-400 disabled:opacity-40"
            >
              <Square className="h-4 w-4" /> Detener Directo
            </button>
          </div>

          <button
            type="button"
            onClick={() => handleCaptureCutNow()}
            disabled={!activeVideoId}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FFD43B] px-4 py-3 text-xs font-black text-[#111318] shadow hover:brightness-105 disabled:opacity-40"
          >
            <Zap className="h-4 w-4" /> ⚡ Escanear Siguiente Bloque y Sacar Mejores Cortes ({clipDurationSec}s c/u)
          </button>

          {/* Live Worker Real-time Status Box */}
          {activeSession && (
            <div className="rounded-xl border border-slate-700 bg-[#111318] p-3.5 space-y-1.5 text-xs">
              <div className="flex items-center justify-between font-bold">
                <span className="text-[#FFD43B] flex items-center gap-1.5">
                  {activeSession.isCapturing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[#FFD43B]" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  )}
                  Estado del Motor En Vivo
                </span>
                <span className="rounded bg-zinc-800 px-2 py-0.5 text-[11px] text-white">
                  {activeSession.cutsCount || 0} cortes guardados
                </span>
              </div>
              <p className="text-zinc-300">{activeSession.currentStatusText}</p>
            </div>
          )}

          {/* Active & Previous Sessions List */}
          <div className="pt-2 border-t border-slate-800 space-y-2">
            <div className="text-xs font-bold text-zinc-400">Sesiones Recientes ({sessions.length})</div>
            <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-[#111318] p-3 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold text-[#F8FAFC]">{s.title}</div>
                    <div className="truncate text-[11px] text-[#94A3B8]">
                      {s.protocol} • {s.liveStreamState} • {s.cutsCount || 0} cortes
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleCaptureCutNow(s.id)}
                      className="rounded-lg bg-[#FFD43B] px-2.5 py-1.5 text-[11px] font-black text-[#111318]"
                    >
                      + Sacar Corte
                    </button>
                    {s.liveStreamState === 'RECORDING' && (
                      <button
                        type="button"
                        onClick={() => handleStopLive(s.id)}
                        className="rounded-lg bg-red-500/20 px-2 py-1.5 text-[11px] font-bold text-red-400"
                      >
                        Parar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (7 cols): Real-Time Live Cuts Gallery */}
        <div className="rounded-2xl border border-slate-800 bg-[#1B1E25] p-5 lg:col-span-7 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-extrabold text-white">
                2. Cortes Verticales 9:16 Extraídos del Directo ({liveClips.length})
              </h2>
              <p className="text-xs text-[#94A3B8]">
                Cada corte se transcribe con Faster-Whisper, se encuadra a 9:16 y se guarda automáticamente en tu Galería Persistente
              </p>
            </div>
          </div>

          {liveClips.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-[#111318] py-16 px-6 text-center">
              <Scissors className="h-10 w-10 text-[#FFD43B] mb-3 opacity-80" />
              <div className="text-sm font-bold text-white">
                Aún no hay cortes en vivo en esta sesión
              </div>
              <p className="mt-1 max-w-md text-xs text-[#94A3B8]">
                Pega la URL de un directo en vivo de YouTube a la izquierda y pulsa &quot;Iniciar Auto-Corte&quot; para que vayan apareciendo aquí los Shorts automáticamente.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {liveClips.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-[#111318] p-4 space-y-3"
                >
                  <div>
                    {c.signedDownloadUrl && (
                      <video
                        src={c.signedDownloadUrl}
                        controls
                        preload="metadata"
                        className="mb-3 h-52 w-full rounded-xl bg-black object-contain"
                      />
                    )}
                    <div className="flex items-center justify-between text-xs">
                      <span className="rounded bg-red-500/20 border border-red-500/40 px-2 py-0.5 font-black text-red-400">
                        🔴 LIVE CUT • {c.durationSec}s
                      </span>
                      <span className="font-bold text-[#FFD43B]">
                        Score {c.scoreTotal ?? 92}/100
                      </span>
                    </div>
                    <div className="mt-2 font-bold text-sm text-white">{c.title}</div>
                    {c.summary && (
                      <p className="mt-1 text-xs text-zinc-400 line-clamp-2">
                        &ldquo;{c.summary}&rdquo;
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-slate-800 pt-3 text-xs">
                    <Link
                      href={`/editor?clipId=${c.id}`}
                      className="flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 font-semibold text-white hover:border-[#FFD43B]"
                    >
                      <Edit3 className="h-3.5 w-3.5" /> Editar
                    </Link>
                    {c.signedDownloadUrl && (
                      <a
                        href={c.signedDownloadUrl}
                        download={`${c.title.replace(/[^a-z0-9_-]/gi, '_')}.mp4`}
                        className="flex items-center gap-1 rounded-lg bg-[#FFD43B] px-3 py-1.5 font-black text-[#111318]"
                      >
                        <Download className="h-3.5 w-3.5" /> Descargar MP4
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
