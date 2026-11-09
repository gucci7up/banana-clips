'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, useStudioStore } from '@/lib/store';
import {
  Sparkles,
  Film,
  Scissors,
  Clock,
  HardDrive,
  Activity,
  Cpu,
  FolderKanban,
  Download,
  Edit3,
  Radio,
  Layers,
  RefreshCw,
  ArrowUpRight,
  Send,
} from 'lucide-react';

export default function DashboardPage() {
  const { user, setWizardOpen } = useStudioStore();
  const [scope, setScope] = useState<'own' | 'global'>('own');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sendingTelegramId, setSendingTelegramId] = useState<string | null>(null);
  const [telegramNotice, setTelegramNotice] = useState<string>('');

  const handleSendToTelegram = async (clipId: string, clipTitle?: string) => {
    setSendingTelegramId(clipId);
    setTelegramNotice(`📱 Enviando "${clipTitle || 'clip'}" a tu Bot de Telegram...`);
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>('/social/telegram-send', {
        method: 'POST',
        body: JSON.stringify({ clipId }),
      });
      setTelegramNotice(res.message || '✅ Video enviado a Telegram.');
    } catch (err: any) {
      setTelegramNotice(`⚠️ ${err?.message || 'Configura tu Bot Token en Publicaciones → Automatización Telegram'}`);
    } finally {
      setSendingTelegramId(null);
    }
  };

  const loadDashboard = async (targetScope: 'own' | 'global', silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await apiFetch(`/dashboard?scope=${targetScope}`);
      setData(res);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard(scope);
    const timer = setInterval(() => loadDashboard(scope, true), 6000);
    return () => clearInterval(timer);
  }, [scope]);

  const stats = data?.stats || {
    totalProjects: 0,
    videosProcessed: 0,
    clipsCreated: 0,
    minutesProcessed: 0,
    storageBytesUsed: 0,
    activeTasks: 0,
  };

  const formatStorage = (bytes: number) => {
    const mb = Number(bytes || 0) / (1024 * 1024);
    if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
    return `${mb.toFixed(2)} MB`;
  };

  return (
    <div className="space-y-6">
      {/* Modern Hero Header */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-800/80 bg-gradient-to-br from-[#161B26] via-[#131720] to-[#0E1118] p-5 sm:p-6 shadow-xl">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#FFD43B]/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#FFD43B]/30 bg-[#FFD43B]/10 px-3 py-1 text-[11px] font-bold text-[#FFD43B]">
              <span className="h-2 w-2 rounded-full bg-[#FFD43B] animate-pulse" />
              Estudio IA en Tiempo Real • PostgreSQL + GPU
            </div>
            <h1 className="mt-2.5 text-xl sm:text-2xl lg:text-3xl font-black tracking-tight text-white">
              Hola, {user?.fullName || 'Creador'} 👋
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-400">
              Tus cortes en vivo, historias animadas 24fps y proyectos están sincronizados en el volumen persistente.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {user?.role === 'SUPER_ADMIN' && (
              <div className="flex rounded-xl border border-slate-800 bg-[#0B0D12]/90 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setScope('own')}
                  className={`rounded-lg px-3 py-1.5 font-bold transition ${
                    scope === 'own' ? 'bg-[#FFD43B] text-[#0B0D12] shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Mis Estadísticas
                </button>
                <button
                  type="button"
                  onClick={() => setScope('global')}
                  className={`rounded-lg px-3 py-1.5 font-bold transition ${
                    scope === 'global' ? 'bg-[#FFD43B] text-[#0B0D12] shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Global
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => loadDashboard(scope)}
              title="Actualizar estadísticas"
              className="rounded-xl border border-slate-800 bg-[#0B0D12]/80 p-2.5 text-slate-300 hover:border-[#FFD43B]/50 hover:text-white transition"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-[#FFD43B]' : ''}`} />
            </button>

            <button
              type="button"
              onClick={() => setWizardOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#FFD43B] to-[#FFB703] px-4 py-2.5 text-xs sm:text-sm font-black text-[#0B0D12] shadow-lg shadow-[#FFD43B]/15 hover:brightness-105 transition"
            >
              <Sparkles className="h-4 w-4" />
              Crear clips con IA
            </button>
          </div>
        </div>
      </div>

      {/* Responsive KPI Cards (2 cols on mobile, 3 on tablet, 6 on desktop) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6">
        <div className="studio-card studio-card-hover p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-400">
            <span>Total Proyectos</span>
            <div className="rounded-lg bg-[#FFD43B]/15 p-2 text-[#FFD43B]">
              <FolderKanban className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-2xl sm:text-3xl font-black text-white" data-testid="stat-projects">
            {stats.totalProjects}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">Sesiones y proyectos</div>
        </div>

        <div className="studio-card studio-card-hover p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-400">
            <span>Videos Procesados</span>
            <div className="rounded-lg bg-sky-500/15 p-2 text-sky-400">
              <Film className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-2xl sm:text-3xl font-black text-white" data-testid="stat-videos">
            {stats.videosProcessed}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">Directos y VODs</div>
        </div>

        <div className="studio-card studio-card-hover p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-400">
            <span>Clips Creados</span>
            <div className="rounded-lg bg-amber-500/20 p-2 text-[#FFD43B]">
              <Scissors className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-2xl sm:text-3xl font-black text-[#FFD43B]" data-testid="stat-clips">
            {stats.clipsCreated}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">Formato vertical 9:16</div>
        </div>

        <div className="studio-card studio-card-hover p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-400">
            <span>Minutos Procesados</span>
            <div className="rounded-lg bg-purple-500/15 p-2 text-purple-400">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-2xl sm:text-3xl font-black text-white">
            {stats.minutesProcessed} <span className="text-sm font-bold text-slate-400">min</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">Analizados con Whisper</div>
        </div>

        <div className="studio-card studio-card-hover p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-400">
            <span>Espacio Utilizado</span>
            <div className="rounded-lg bg-indigo-500/15 p-2 text-indigo-400">
              <HardDrive className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-xl sm:text-2xl font-black text-white">
            {formatStorage(stats.storageBytesUsed)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">Disco persistente /data</div>
        </div>

        <div className="studio-card studio-card-hover p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-400">
            <span>Tareas Activas</span>
            <div className="rounded-lg bg-emerald-500/15 p-2 text-emerald-400">
              <Activity className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-2xl sm:text-3xl font-black text-white">
            <span>{stats.activeTasks}</span>
            {stats.activeTasks > 0 && (
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                EN VIVO
              </span>
            )}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">Workers & Live Clipper</div>
        </div>
      </div>

      {/* Quick Launch Studio Modules */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          href="/live-clipper"
          className="group studio-card studio-card-hover relative overflow-hidden p-4 sm:p-5"
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/15 px-2.5 py-0.5 text-[10px] font-extrabold text-red-400">
              <Radio className="h-3 w-3 animate-pulse" /> LIVE HUNTER
            </span>
            <ArrowUpRight className="h-4 w-4 text-slate-500 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[#FFD43B]" />
          </div>
          <div className="mt-3 text-sm sm:text-base font-extrabold text-white group-hover:text-[#FFD43B] transition">
            Live Clipper Multi-Highlight
          </div>
          <p className="mt-1 text-xs text-slate-400 leading-relaxed">
            Extrae de 2 a 3 mejores momentos cada 5 o 10 min de cualquier directo de YouTube en tiempo real.
          </p>
        </Link>

        <Link
          href="/ai-montage"
          className="group studio-card studio-card-hover relative overflow-hidden p-4 sm:p-5"
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-300">
              <Layers className="h-3 w-3" /> 24 FPS ENGINE
            </span>
            <ArrowUpRight className="h-4 w-4 text-slate-500 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[#FFD43B]" />
          </div>
          <div className="mt-3 text-sm sm:text-base font-extrabold text-white group-hover:text-[#FFD43B] transition">
            Stickman 24FPS & Story 60s
          </div>
          <p className="mt-1 text-xs text-slate-400 leading-relaxed">
            Motor de animación esqueletal 2D cuadro por cuadro con comedia física y sonidos procedurales.
          </p>
        </Link>

        <Link
          href="/ai-clipping"
          className="group studio-card studio-card-hover relative overflow-hidden p-4 sm:p-5"
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FFD43B]/30 bg-[#FFD43B]/15 px-2.5 py-0.5 text-[10px] font-extrabold text-[#FFD43B]">
              <Scissors className="h-3 w-3" /> 20 ETAPAS IA
            </span>
            <ArrowUpRight className="h-4 w-4 text-slate-500 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[#FFD43B]" />
          </div>
          <div className="mt-3 text-sm sm:text-base font-extrabold text-white group-hover:text-[#FFD43B] transition">
            AI Clipping Automático
          </div>
          <p className="mt-1 text-xs text-slate-400 leading-relaxed">
            Convierte videos largos en Shorts con Faster-Whisper, encuadre 9:16 y puntuación de viralidad.
          </p>
        </Link>

        <Link
          href="/library"
          className="group studio-card studio-card-hover relative overflow-hidden p-4 sm:p-5"
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/15 px-2.5 py-0.5 text-[10px] font-extrabold text-sky-300">
              <FolderKanban className="h-3 w-3" /> GALERÍA PERSISTENTE
            </span>
            <ArrowUpRight className="h-4 w-4 text-slate-500 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[#FFD43B]" />
          </div>
          <div className="mt-3 text-sm sm:text-base font-extrabold text-white group-hover:text-[#FFD43B] transition">
            Mi Biblioteca de Videos
          </div>
          <p className="mt-1 text-xs text-slate-400 leading-relaxed">
            Reproduce y descarga todos tus cortes en vivo, Shorts y animaciones de 60s guardados en `/data`.
          </p>
        </Link>
      </div>

      {/* Main Content Split: Recent Clips + Hardware Telemetry */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent Clips */}
        <div className="lg:col-span-2 studio-card p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-white">Clips Generados Recientes</h2>
              <p className="text-xs text-slate-400">Últimos cortes extraídos por IA y guardados en tu galería</p>
            </div>
            <Link
              href="/library"
              className="rounded-xl border border-[#FFD43B]/30 bg-[#FFD43B]/10 px-3 py-1.5 text-xs font-bold text-[#FFD43B] hover:bg-[#FFD43B]/20 transition"
            >
              Ver todos en Biblioteca →
            </Link>
          </div>

          {telegramNotice && (
            <div className="mb-3 rounded-xl border border-sky-500/40 bg-sky-500/10 px-3.5 py-2 text-xs font-bold text-sky-300">
              {telegramNotice}
            </div>
          )}

          {loading ? (
            <div className="space-y-3">
              <div className="h-20 animate-pulse rounded-2xl bg-slate-800/50" />
              <div className="h-20 animate-pulse rounded-2xl bg-slate-800/50" />
              <div className="h-20 animate-pulse rounded-2xl bg-slate-800/50" />
            </div>
          ) : (data?.recentClips || []).length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center text-xs text-slate-400">
              Aún no hay clips procesados. Pulsa <strong>"Crear clips con IA"</strong> o abre <strong>"Live Clipper"</strong>.
            </div>
          ) : (
            <div className="space-y-3">
              {data.recentClips.map((clip: any) => (
                <div
                  key={clip.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slate-800/90 bg-[#0B0D12]/80 p-3.5 sm:p-4 hover:border-slate-700 transition"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="shrink-0 rounded-lg bg-gradient-to-r from-[#FFD43B] to-[#FFB703] px-2 py-0.5 text-[11px] font-black text-[#0B0D12]">
                        Score {clip.scoreTotal ?? 90}/100
                      </span>
                      <span className="truncate font-bold text-sm text-white">{clip.title}</span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-xs text-slate-400">
                      Duración: <strong className="text-slate-200">{clip.durationSec}s</strong> • Formato:{' '}
                      <strong className="text-slate-200">{clip.aspectRatio}</strong> • {clip.explanation}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={sendingTelegramId === clip.id}
                      onClick={() => handleSendToTelegram(clip.id, clip.title)}
                      className="flex flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-xl border border-sky-500/40 bg-sky-500/15 px-3 py-2 text-xs font-bold text-sky-300 hover:bg-sky-500/30 disabled:opacity-50 transition"
                      title="Enviar video MP4 directo a tu Telegram"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>{sendingTelegramId === clip.id ? 'Enviando...' : '📱 Telegram'}</span>
                    </button>
                    <Link
                      href={`/editor?clipId=${clip.id}`}
                      className="flex flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs font-bold text-slate-200 hover:border-[#FFD43B] hover:text-white transition"
                    >
                      <Edit3 className="h-3.5 w-3.5" /> Editar
                    </Link>
                    <Link
                      href="/library"
                      className="flex flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-xl bg-[#FFD43B] px-3.5 py-2 text-xs font-black text-[#0B0D12] hover:bg-[#FFB703] transition"
                    >
                      <Download className="h-3.5 w-3.5" /> Ver / Bajar
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Workers Status & Recent Jobs */}
        <div className="space-y-6">
          <div className="studio-card p-4 sm:p-5">
            <h2 className="mb-3.5 flex items-center gap-2 text-base font-extrabold text-white">
              <Cpu className="h-4 w-4 text-[#FFD43B]" /> Estado de Workers & GPU
            </h2>
            <div className="space-y-2.5">
              {(data?.workers || []).map((w: any) => (
                <div
                  key={w.id}
                  className="rounded-xl border border-slate-800/90 bg-[#0B0D12]/80 p-3 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-100">{w.workerName}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      {w.status}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-[11px] text-slate-400">
                    {w.gpuName || w.hardwareProfile}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="studio-card p-4 sm:p-5">
            <h2 className="mb-3 text-base font-extrabold text-white">Trabajos Recientes</h2>
            <div className="space-y-2.5">
              {(data?.recentJobs || []).length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-800 p-4 text-center text-xs text-slate-400">
                  Los cortes en directo se procesan al instante en el motor en vivo.
                </div>
              ) : (
                data.recentJobs.map((j: any) => (
                  <div key={j.id} className="rounded-xl border border-slate-800 bg-[#0B0D12]/80 p-3 text-xs">
                    <div className="flex items-center justify-between font-bold">
                      <span className="truncate pr-2 text-white">{j.videoTitle || j.jobType}</span>
                      <span className="shrink-0 text-[#FFD43B]">
                        {j.status} ({j.progressPercent}%)
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#FFD43B] to-[#FFB703]"
                        style={{ width: `${Math.min(100, Math.max(5, j.progressPercent || 0))}%` }}
                      />
                    </div>
                    <div className="mt-1.5 text-[11px] text-slate-400">{j.currentPhase}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
