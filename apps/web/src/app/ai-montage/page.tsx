'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/store';
import {
  Layers,
  Plus,
  CheckSquare,
  Sparkles,
  Film,
  Wand2,
  Loader2,
  Download,
  Cpu,
  Volume2,
  Subtitles,
  KeyRound,
  CheckCircle2,
} from 'lucide-react';

const MONTAGE_TEMPLATES = [
  'Stickman Comedy 60s (NVIDIA NIM)',
  'Gaming Compilation',
  'Podcast Highlights',
  'Funny Moments',
  'Best of Stream',
  'Educational Recap',
];

interface StorySceneSpec {
  sceneNumber: number;
  title: string;
  visualPrompt: string;
  narrationText: string;
  cameraMotion: 'ZOOM_IN' | 'ZOOM_OUT' | 'PAN_RIGHT' | 'PAN_LEFT' | 'PUNCH_SHAKE';
  sfxType: 'EFFORT' | 'KNOCK' | 'CLANG' | 'EXPLOSION' | 'DOOR_CREAK' | 'LAUGH';
  durationSec: number;
}

const DEFAULT_IDEA =
  'Intentó abrir la puerta de todas las formas posibles (tirando, con una palanca, con una patada voladora) excepto empujando hacia adentro';

export default function AiMontagePage() {
  const [activeTab, setActiveTab] = useState<'STORY_60S' | 'CLASSIC_MONTAGE'>('STORY_60S');

  // NVIDIA NIM 60s Story Studio State
  const [storyTitle, setStoryTitle] = useState('He Tried EVERYTHING… Except Pushing 😂🚪 #Shorts');
  const [ideaPrompt, setIdeaPrompt] = useState(DEFAULT_IDEA);
  const [stylePreset, setStylePreset] = useState('STICKMAN_COMEDY');
  const [sceneCount, setSceneCount] = useState<number>(6);
  const [totalDurationSec, setTotalDurationSec] = useState<number>(60);
  const [seed, setSeed] = useState<number>(42);
  const [voiceName, setVoiceName] = useState('es-MX-JorgeNeural');
  const [burnSubtitles, setBurnSubtitles] = useState(true);
  const [nvidiaApiKey, setNvidiaApiKey] = useState(
    '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'
  );

  const [scenes, setScenes] = useState<StorySceneSpec[]>([]);
  const [loadingStoryboard, setLoadingStoryboard] = useState(false);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [storyJob, setStoryJob] = useState<any>(null);

  // Classic Montage State
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
    handleGenerateStoryboard(DEFAULT_IDEA, 'STICKMAN_COMEDY', 6, 60);
  }, []);

  const handleGenerateStoryboard = async (
    customIdea?: string,
    customStyle?: string,
    customCount?: number,
    customDur?: number
  ) => {
    setLoadingStoryboard(true);
    try {
      const res = await apiFetch<{ scenes: StorySceneSpec[] }>('/story/storyboard', {
        method: 'POST',
        body: JSON.stringify({
          ideaPrompt: customIdea ?? ideaPrompt,
          stylePreset: customStyle ?? stylePreset,
          sceneCount: customCount ?? sceneCount,
          totalDurationSec: customDur ?? totalDurationSec,
          nvidiaApiKey,
        }),
      });
      if (res.scenes && res.scenes.length > 0) {
        setScenes(res.scenes);
      }
    } catch (err: any) {
      alert(err.message || 'Error al generar el guion de escenas.');
    } finally {
      setLoadingStoryboard(false);
    }
  };

  const updateSceneField = (idx: number, field: keyof StorySceneSpec, value: any) => {
    setScenes((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: value };
      return copy;
    });
  };

  const handleRender60sStory = async () => {
    setGeneratingVideo(true);
    setStoryJob({
      status: 'RUNNING',
      progressPercent: 4,
      currentPhase: 'Iniciando motor NVIDIA NIM (FLUX.1-dev + Nemotron) para historia de 60s...',
    });

    try {
      const startRes = await apiFetch<{ jobId: string }>('/story/generate-60s', {
        method: 'POST',
        body: JSON.stringify({
          storyTitle,
          scenes,
          ideaPrompt,
          stylePreset,
          sceneCount,
          totalDurationSec,
          nvidiaApiKey,
          seed,
          voiceName,
          burnSubtitles,
        }),
      });

      while (true) {
        await new Promise((r) => setTimeout(r, 1200));
        const poll = await apiFetch<{ job: any }>(`/story/jobs/${startRes.jobId}`);
        if (poll?.job) {
          setStoryJob(poll.job);
          if (poll.job.status === 'COMPLETED') {
            break;
          }
          if (poll.job.status === 'FAILED') {
            throw new Error(poll.job.errorMessage || 'Falló la generación de la historia.');
          }
        }
      }

      await loadAll();
    } catch (err: any) {
      alert(err.message || 'Error al generar el video de 60 segundos.');
    } finally {
      setGeneratingVideo(false);
    }
  };

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
    <div className="space-y-6 pb-12">
      {/* Header & Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-0.5 text-[11px] font-extrabold text-emerald-400 border border-emerald-500/30">
              <Cpu className="h-3.5 w-3.5" /> NVIDIA NIM (FLUX.1-dev + Nemotron) Activo
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-extrabold text-[#F8FAFC]">
            AI Story & Stickman 60s Studio + AI Montage
          </h1>
          <p className="text-xs text-[#94A3B8]">
            Genera automáticamente de 6 a 8 escenas consistentes con IA de NVIDIA (`build.nvidia.com`), voz narrador (`edge-tts`), efectos de sonido y únelas en un video vertical de 60 segundos
          </p>
        </div>

        <div className="flex rounded-2xl border border-zinc-800 bg-[#14151A] p-1">
          <button
            type="button"
            onClick={() => setActiveTab('STORY_60S')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === 'STORY_60S'
                ? 'bg-[#FFD43B] text-[#111318] shadow'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Sparkles className="h-4 w-4" /> Generador de Historias & Stickman (60s)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('CLASSIC_MONTAGE')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === 'CLASSIC_MONTAGE'
                ? 'bg-[#FFD43B] text-[#111318] shadow'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Layers className="h-4 w-4" /> Unir Clips Existentes ({clips.length})
          </button>
        </div>
      </div>

      {activeTab === 'STORY_60S' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* LEFT COLUMN (5 cols): Story & NVIDIA NIM Configuration */}
          <div className="space-y-5 lg:col-span-5">
            <div className="rounded-3xl border border-zinc-800 bg-[#16181F] p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-base font-extrabold text-[#FFD43B]">
                  <Wand2 className="h-5 w-5" /> 1. Idea y Configuración NVIDIA NIM
                </h2>
                <span className="rounded-lg bg-zinc-800 px-2.5 py-1 text-[10px] font-bold text-emerald-400">
                  9:16 Vertical HD
                </span>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-zinc-300">
                  Título del Short / Video de 60s
                </label>
                <input
                  type="text"
                  value={storyTitle}
                  onChange={(e) => setStoryTitle(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-[#0E1015] px-3.5 py-2.5 text-xs text-white focus:border-[#FFD43B] focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-zinc-300">
                  Idea de la Historia (El director IA creará las 6 escenas y diálogos)
                </label>
                <textarea
                  rows={3}
                  value={ideaPrompt}
                  onChange={(e) => setIdeaPrompt(e.target.value)}
                  placeholder="Ej: Un stickman intenta abrir una puerta de todas las formas posibles excepto empujando..."
                  className="w-full rounded-xl border border-zinc-700 bg-[#0E1015] p-3 text-xs text-white focus:border-[#FFD43B] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-zinc-400">
                    Estilo Visual (NVIDIA FLUX.1-dev)
                  </label>
                  <select
                    value={stylePreset}
                    onChange={(e) => setStylePreset(e.target.value)}
                    className="w-full rounded-xl border border-zinc-700 bg-[#0E1015] px-3 py-2 text-xs font-semibold text-white"
                  >
                    <option value="STICKMAN_COMEDY">Stickman Comedy 2D (Fondo Menta)</option>
                    <option value="CARTOON_3D">Cartoon 3D Estilo Pixar</option>
                    <option value="ANIME_ACTION">Anime 2D Expresivo</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-zinc-400">
                     Duración Total y Escenas
                  </label>
                  <select
                    value={`${sceneCount}_${totalDurationSec}`}
                    onChange={(e) => {
                      const [sc, dur] = e.target.value.split('_').map(Number);
                      setSceneCount(sc);
                      setTotalDurationSec(dur);
                    }}
                    className="w-full rounded-xl border border-zinc-700 bg-[#0E1015] px-3 py-2 text-xs font-semibold text-white"
                  >
                    <option value="6_60">6 Escenas × 10s = 60 Segundos</option>
                    <option value="8_64">8 Escenas × 8s = 64 Segundos</option>
                    <option value="4_40">4 Escenas × 10s = 40 Segundos</option>
                    <option value="3_30">3 Escenas × 10s = 30 Segundos</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-zinc-400">
                    <Volume2 className="h-3.5 w-3.5 text-[#FFD43B]" /> Voz Narrador IA (TTS)
                  </label>
                  <select
                    value={voiceName}
                    onChange={(e) => setVoiceName(e.target.value)}
                    className="w-full rounded-xl border border-zinc-700 bg-[#0E1015] px-3 py-2 text-xs font-semibold text-white"
                  >
                    <option value="es-MX-JorgeNeural">Español (Jorge - Dinámico)</option>
                    <option value="es-ES-AlvaroNeural">Español (Álvaro - Narrador)</option>
                    <option value="es-MX-DaliaNeural">Español (Dalia - Expresiva)</option>
                    <option value="en-US-ChristopherNeural">Inglés (Christopher - Story)</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-zinc-400">
                    <Subtitles className="h-3.5 w-3.5 text-[#FFD43B]" /> Semilla de Personaje (Seed)
                  </label>
                  <input
                    type="number"
                    value={seed}
                    onChange={(e) => setSeed(Number(e.target.value) || 42)}
                    className="w-full rounded-xl border border-zinc-700 bg-[#0E1015] px-3 py-2 text-xs font-semibold text-white"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 flex items-center justify-between text-[11px] font-semibold text-zinc-400">
                  <span className="flex items-center gap-1">
                    <KeyRound className="h-3.5 w-3.5 text-emerald-400" /> NVIDIA NIM API Key (build.nvidia.com)
                  </span>
                  <span className="text-[10px] text-emerald-400">Conectada ✓</span>
                </label>
                <input
                  type="password"
                  value={nvidiaApiKey}
                  onChange={(e) => setNvidiaApiKey(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-[#0E1015] px-3 py-2 text-xs text-zinc-300"
                />
              </div>

              <div className="flex flex-col gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={loadingStoryboard || generatingVideo}
                  onClick={() =>
                    handleGenerateStoryboard(ideaPrompt, stylePreset, sceneCount, totalDurationSec)
                  }
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#FFD43B]/50 bg-[#FFD43B]/10 px-4 py-2.5 text-xs font-extrabold text-[#FFD43B] transition hover:bg-[#FFD43B]/20 disabled:opacity-50"
                >
                  {loadingStoryboard ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  <span>
                    {loadingStoryboard
                      ? 'Generando guion de escenas con NVIDIA Nemotron...'
                      : `Re-generar Guion de ${sceneCount} Escenas con IA`}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={generatingVideo || scenes.length === 0}
                  onClick={handleRender60sStory}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#FFD43B] to-[#FFB703] px-5 py-3.5 text-sm font-black text-[#111318] shadow-lg transition hover:brightness-105 disabled:opacity-50"
                >
                  {generatingVideo ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Film className="h-4 w-4" />
                  )}
                  <span>
                    {generatingVideo
                      ? 'Creando Escenas con NVIDIA FLUX.1 y Uniendo 60s...'
                      : `Crear las ${scenes.length} Escenas y Unir en Video de ${totalDurationSec}s`}
                  </span>
                </button>
              </div>

              {/* Real-time Scene-by-Scene Progress Bar */}
              {storyJob && (
                <div className="mt-4 rounded-2xl border border-zinc-800 bg-[#0E1015] p-4 space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-[#FFD43B]">{storyJob.currentPhase}</span>
                    <span className="text-white">{storyJob.progressPercent}%</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="h-full bg-[#FFD43B] transition-all duration-300"
                      style={{ width: `${storyJob.progressPercent}%` }}
                    />
                  </div>

                  {storyJob.status === 'COMPLETED' && storyJob.signedDownloadUrl && (
                    <div className="mt-4 space-y-3 pt-2 border-t border-zinc-800">
                      <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                        <CheckCircle2 className="h-4 w-4" /> ¡Video de 60 segundos generado y unido con éxito!
                      </div>
                      <video
                        src={storyJob.signedDownloadUrl}
                        controls
                        className="mx-auto max-h-80 rounded-2xl border border-zinc-700 bg-black"
                      />
                      <a
                        href={storyJob.signedDownloadUrl}
                        download={`${storyTitle.replace(/[^a-z0-9_-]/gi, '_')}_60s.mp4`}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-black text-black hover:bg-emerald-400"
                      >
                        <Download className="h-4 w-4" /> Descargar Video Completo MP4 (60s)
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN (7 cols): Editable 6-8 Scene Storyboard Cards */}
          <div className="space-y-4 lg:col-span-7">
            <div className="rounded-3xl border border-zinc-800 bg-[#16181F] p-6 shadow-2xl">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-extrabold text-white">
                    2. Storyboard de Escenas ({scenes.length} escenas ={' '}
                    {scenes.reduce((acc, s) => acc + Number(s.durationSec || 10), 0)}s totales)
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Puedes personalizar el diálogo, el prompt visual de NVIDIA FLUX.1-dev o el movimiento de cámara antes de renderizar
                  </p>
                </div>
              </div>

              <div className="space-y-3.5">
                {scenes.map((sc, idx) => (
                  <div
                    key={idx}
                    className="rounded-2xl border border-zinc-800 bg-[#0E1015] p-4 space-y-3 transition hover:border-zinc-700"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#FFD43B] text-xs font-black text-[#111318]">
                          {idx + 1}
                        </span>
                        <input
                          type="text"
                          value={sc.title}
                          onChange={(e) => updateSceneField(idx, 'title', e.target.value)}
                          className="rounded-lg border border-transparent bg-transparent px-2 py-0.5 text-xs font-extrabold text-white focus:border-zinc-700 focus:bg-[#16181F] focus:outline-none"
                        />
                      </div>

                      <div className="flex items-center gap-2 text-[11px]">
                        <select
                          value={sc.cameraMotion}
                          onChange={(e) => updateSceneField(idx, 'cameraMotion', e.target.value)}
                          className="rounded-lg border border-zinc-800 bg-[#16181F] px-2 py-1 text-[11px] font-semibold text-amber-300"
                        >
                          <option value="ZOOM_IN">Cámara: Zoom In</option>
                          <option value="PUNCH_SHAKE">Cámara: Shake Cómico</option>
                          <option value="ZOOM_OUT">Cámara: Zoom Out</option>
                          <option value="PAN_RIGHT">Cámara: Paneo Derecha</option>
                          <option value="PAN_LEFT">Cámara: Paneo Izquierda</option>
                        </select>

                        <span className="rounded-lg bg-zinc-800 px-2.5 py-1 font-bold text-zinc-300">
                          {sc.durationSec}s
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#FFD43B]">
                          Narración / Subtítulos de la Escena
                        </label>
                        <textarea
                          rows={2}
                          value={sc.narrationText}
                          onChange={(e) => updateSceneField(idx, 'narrationText', e.target.value)}
                          className="w-full rounded-xl border border-zinc-800 bg-[#16181F] p-2.5 text-xs text-white focus:border-[#FFD43B] focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                          Prompt Visual (NVIDIA FLUX.1-dev)
                        </label>
                        <textarea
                          rows={2}
                          value={sc.visualPrompt}
                          onChange={(e) => updateSceneField(idx, 'visualPrompt', e.target.value)}
                          className="w-full rounded-xl border border-zinc-800 bg-[#16181F] p-2.5 text-[11px] text-zinc-300 focus:border-[#FFD43B] focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <form
            onSubmit={handleCreateMontage}
            className="space-y-4 rounded-2xl border border-slate-800 bg-[#1B1E25] p-5"
          >
            <h2 className="text-base font-bold text-[#FFD43B]">Crear Nuevo Montaje de Clips</h2>
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
                  <option key={t} value={t}>
                    {t}
                  </option>
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

          <div className="space-y-6 lg:col-span-2">
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
                      <div className="text-[#94A3B8]">
                        {c.durationSec}s • Score {c.scoreTotal}/100
                      </div>
                    </div>
                    <CheckSquare className="h-4 w-4 text-[#FFD43B]" />
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-[#1B1E25] p-5">
              <h2 className="mb-3 text-base font-bold">Historias 60s y Montajes Guardados ({montages.length})</h2>
              <div className="space-y-3">
                {montages.map((m) => (
                  <div
                    key={m.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-[#111318] p-3 text-xs"
                  >
                    <div>
                      <div className="text-sm font-bold">{m.name}</div>
                      <div className="text-[#94A3B8]">
                        Plantilla: {m.templateName} • Formato: {m.aspectRatio}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {m.signedDownloadUrl && (
                        <a
                          href={m.signedDownloadUrl}
                          download={`${m.name}.mp4`}
                          className="rounded-lg bg-[#FFD43B] px-3 py-1.5 font-bold text-[#111318]"
                        >
                          Descargar MP4
                        </a>
                      )}
                      <span className="rounded bg-emerald-500/20 px-2.5 py-1 font-bold text-emerald-400">
                        {m.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
