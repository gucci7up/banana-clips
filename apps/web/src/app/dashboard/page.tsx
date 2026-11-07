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
  Play,
  Download,
  Edit3,
} from 'lucide-react';

export default function DashboardPage() {
  const { user, setWizardOpen } = useStudioStore();
  const [scope, setScope] = useState<'own' | 'global'>('own');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadDashboard = async (targetScope: 'own' | 'global') => {
    setLoading(true);
    try {
      const res = await apiFetch(`/dashboard?scope=${targetScope}`);
      setData(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard(scope);
  }, [scope]);

  const stats = data?.stats || {
    totalProjects: 0,
    videosProcessed: 0,
    clipsCreated: 0,
    minutesProcessed: 0,
    storageBytesUsed: 0,
    activeTasks: 0,
  };

  const formatMb = (bytes: number) => `${(Number(bytes || 0) / (1024 * 1024)).toFixed(2)} MB`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-[#F8FAFC]">Dashboard Principal</h1>
          <p className="text-xs text-[#94A3B8]">
            Estadísticas reales en tiempo real desde PostgreSQL • Usuario: {user?.fullName}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {user?.role === 'SUPER_ADMIN' && (
            <div className="flex rounded-xl border border-slate-800 bg-[#1B1E25] p-1 text-xs">
              <button
                type="button"
                onClick={() => setScope('own')}
                className={`rounded-lg px-3 py-1.5 font-semibold ${
                  scope === 'own' ? 'bg-[#FFD43B] text-[#111318]' : 'text-[#94A3B8]'
                }`}
              >
                Mis Estadísticas
              </button>
              <button
                type="button"
                onClick={() => setScope('global')}
                className={`rounded-lg px-3 py-1.5 font-semibold ${
                  scope === 'global' ? 'bg-[#FFD43B] text-[#111318]' : 'text-[#94A3B8]'
                }`}
              >
                Global del Sistema
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-[#FFD43B] px-5 py-2.5 text-sm font-bold text-[#111318] shadow hover:bg-[#FFB703]"
          >
            <Sparkles className="h-4 w-4" />
            Crear clips con IA
          </button>
        </div>
      </div>

      {/* Real KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="rounded-2xl border border-slate-800 bg-[#1B1E25] p-4">
          <div className="flex items-center justify-between text-xs text-[#94A3B8]">
            <span>Total Proyectos</span>
            <FolderKanban className="h-4 w-4 text-[#FFD43B]" />
          </div>
          <div className="mt-2 text-2xl font-extrabold" data-testid="stat-projects">{stats.totalProjects}</div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-[#1B1E25] p-4">
          <div className="flex items-center justify-between text-xs text-[#94A3B8]">
            <span>Videos Procesados</span>
            <Film className="h-4 w-4 text-[#FFD43B]" />
          </div>
          <div className="mt-2 text-2xl font-extrabold" data-testid="stat-videos">{stats.videosProcessed}</div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-[#1B1E25] p-4">
          <div className="flex items-center justify-between text-xs text-[#94A3B8]">
            <span>Clips Creados</span>
            <Scissors className="h-4 w-4 text-[#FFB703]" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-[#FFD43B]" data-testid="stat-clips">{stats.clipsCreated}</div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-[#1B1E25] p-4">
          <div className="flex items-center justify-between text-xs text-[#94A3B8]">
            <span>Minutos Procesados</span>
            <Clock className="h-4 w-4 text-[#FFD43B]" />
          </div>
          <div className="mt-2 text-2xl font-extrabold">{stats.minutesProcessed} min</div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-[#1B1E25] p-4">
          <div className="flex items-center justify-between text-xs text-[#94A3B8]">
            <span>Espacio Utilizado</span>
            <HardDrive className="h-4 w-4 text-[#FFD43B]" />
          </div>
          <div className="mt-2 text-xl font-extrabold">{formatMb(stats.storageBytesUsed)}</div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-[#1B1E25] p-4">
          <div className="flex items-center justify-between text-xs text-[#94A3B8]">
            <span>Tareas Activas</span>
            <Activity className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-extrabold">{stats.activeTasks}</div>
        </div>
      </div>

      {/* Quick Accesses */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Link href="/ai-clipping" className="rounded-2xl border border-slate-800 bg-[#1B1E25] p-4 hover:border-[#FFD43B]/60 transition">
          <div className="text-sm font-bold text-[#FFD43B]">AI Clipping (20 Etapas)</div>
          <p className="mt-1 text-xs text-[#94A3B8]">Genera clips automáticos con Faster-Whisper, escenas y puntuación 0-100.</p>
        </Link>
        <Link href="/find-moments" className="rounded-2xl border border-slate-800 bg-[#1B1E25] p-4 hover:border-[#FFD43B]/60 transition">
          <div className="text-sm font-bold text-[#FFD43B]">Find Moments (pgvector)</div>
          <p className="mt-1 text-xs text-[#94A3B8]">Busca por lenguaje natural momentos de risa, dinero, IA o jugadas.</p>
        </Link>
        <Link href="/game-clipping" className="rounded-2xl border border-slate-800 bg-[#1B1E25] p-4 hover:border-[#FFD43B]/60 transition">
          <div className="text-sm font-bold text-[#FFD43B]">Game Clipping</div>
          <p className="mt-1 text-xs text-[#94A3B8]">Detectores para Fortnite, GTA V/VI, Valorant, Minecraft y Call of Duty.</p>
        </Link>
        <Link href="/editor" className="rounded-2xl border border-slate-800 bg-[#1B1E25] p-4 hover:border-[#FFD43B]/60 transition">
          <div className="text-sm font-bold text-[#FFD43B]">Editor Timeline & Texto</div>
          <p className="mt-1 text-xs text-[#94A3B8]">Edición no destructiva, subtítulos ASS animados y Auto-Reframe 9:16.</p>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent Clips */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-[#1B1E25] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold">Clips Generados Recientes</h2>
            <Link href="/library" className="text-xs font-semibold text-[#FFD43B] hover:underline">
              Ver todos en Biblioteca →
            </Link>
          </div>
          {loading ? (
            <div className="space-y-3">
              <div className="h-16 animate-pulse rounded-xl bg-slate-800/60" />
              <div className="h-16 animate-pulse rounded-xl bg-slate-800/60" />
            </div>
          ) : (data?.recentClips || []).length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-xs text-[#94A3B8]">
              Aún no hay clips procesados. Pulsa <strong>"Crear clips con IA"</strong> para procesar tu primer video real.
            </div>
          ) : (
            <div className="space-y-3">
              {data.recentClips.map((clip: any) => (
                <div
                  key={clip.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-[#111318] p-3.5"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-[#FFD43B] px-2 py-0.5 text-xs font-black text-[#111318]">
                        Score {clip.scoreTotal ?? 85}/100
                      </span>
                      <span className="font-semibold text-sm">{clip.title}</span>
                    </div>
                    <p className="mt-1 text-xs text-[#94A3B8]">
                      Duración: {clip.durationSec}s • Formato: {clip.aspectRatio} • {clip.explanation}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/editor?clipId=${clip.id}`}
                      className="flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold hover:border-[#FFD43B]"
                    >
                      <Edit3 className="h-3.5 w-3.5" /> Editar
                    </Link>
                    <Link
                      href="/library"
                      className="flex items-center gap-1 rounded-lg bg-[#FFD43B] px-3 py-1.5 text-xs font-bold text-[#111318]"
                    >
                      <Download className="h-3.5 w-3.5" /> Descargar
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Workers Status & Recent Jobs */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-[#1B1E25] p-5">
            <h2 className="mb-3 flex items-center gap-2 text-base font-bold">
              <Cpu className="h-4 w-4 text-[#FFD43B]" /> Actividad de Workers y Hardware
            </h2>
            <div className="space-y-2.5">
              {(data?.workers || []).map((w: any) => (
                <div key={w.id} className="rounded-xl border border-slate-800 bg-[#111318] p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#F8FAFC]">{w.workerName}</span>
                    <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                      {w.status}
                    </span>
                  </div>
                  <div className="mt-1 text-[#94A3B8]">
                    Perfil: {w.hardwareProfile} {w.gpuName ? `(${w.gpuName})` : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#1B1E25] p-5">
            <h2 className="mb-3 text-base font-bold">Historial de Trabajos</h2>
            <div className="space-y-2">
              {(data?.recentJobs || []).length === 0 ? (
                <div className="text-xs text-[#94A3B8]">Sin trabajos recientes.</div>
              ) : (
                data.recentJobs.map((j: any) => (
                  <div key={j.id} className="rounded-xl border border-slate-800 bg-[#111318] p-3 text-xs">
                    <div className="flex items-center justify-between font-semibold">
                      <span>{j.videoTitle || j.jobType}</span>
                      <span className="text-[#FFD43B]">{j.status} ({j.progressPercent}%)</span>
                    </div>
                    <div className="mt-1 text-[#94A3B8]">{j.currentPhase}</div>
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
