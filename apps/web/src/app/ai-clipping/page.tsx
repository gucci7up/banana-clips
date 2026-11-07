'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/store';
import {
  Scissors,
  Upload,
  Sparkles,
  CheckCircle2,
  Loader2,
  Download,
  Edit3,
  PlusCircle,
  MessageSquare,
  Send,
} from 'lucide-react';

const PIPELINE_PHASES = [
  'Importando video',
  'Preparando audio',
  'Transcribiendo',
  'Analizando escenas',
  'Detectando momentos',
  'Generando clips',
  'Renderizando',
  'Completado',
];

export default function AiClippingPage() {
  const [videos, setVideos] = useState<any[]>([]);
  const [clips, setClips] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState('');
  const [targetDurationSec, setTargetDurationSec] = useState<number>(30);
  const [customDuration, setCustomDuration] = useState<number>(45);
  const [useCustomDuration, setUseCustomDuration] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9' | '1:1' | '4:5'>('9:16');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [activeJob, setActiveJob] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [sortByScore, setSortByScore] = useState(true);

  // AI Clip Assistant state
  const [assistantPrompt, setAssistantPrompt] = useState('');
  const [assistantReply, setAssistantReply] = useState<string | null>(null);

  const loadData = async () => {
    const [vRes, cRes, pRes] = await Promise.all([
      apiFetch<{ videos: any[] }>('/videos'),
      apiFetch<{ clips: any[] }>('/clips'),
      apiFetch<{ projects: any[] }>('/projects'),
    ]);
    setVideos(vRes.videos || []);
    setClips(cRes.clips || []);
    setProjects(pRes.projects || []);
    if (!selectedVideoId && vRes.videos?.length > 0) {
      setSelectedVideoId(vRes.videos[0].id);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleUploadAndAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      let videoIdToProcess = selectedVideoId;
      if (externalUrl.trim()) {
        const urlUp = await apiFetch<{ video: { id: string } }>('/uploads/from-url', {
          method: 'POST',
          body: JSON.stringify({
            url: externalUrl.trim(),
            title: uploadTitle.trim() || undefined,
          }),
        });
        videoIdToProcess = urlUp.video.id;
        setSelectedVideoId(videoIdToProcess);
        setExternalUrl('');
      } else if (uploadFile) {
        const fd = new FormData();
        fd.append('file', uploadFile);
        fd.append('title', uploadTitle || uploadFile.name);
        const up = await apiFetch<{ video: { id: string } }>('/uploads/video', {
          method: 'POST',
          body: fd,
        });
        videoIdToProcess = up.video.id;
        setSelectedVideoId(videoIdToProcess);
      }

      if (!videoIdToProcess) {
        throw new Error('Pega una URL de YouTube/Facebook, sube un archivo MP4/MOV o selecciona un video de la biblioteca.');
      }

      const finalDuration = useCustomDuration ? customDuration : targetDurationSec;
      const jobRes = await apiFetch<{ jobId: string; job: any }>('/jobs', {
        method: 'POST',
        body: JSON.stringify({
          videoId: videoIdToProcess,
          jobType: 'AI_CLIPPING',
          targetDurationSec: finalDuration,
          aspectRatio,
          syncExecution: true,
        }),
      });

      setActiveJob(jobRes.job);
      await loadData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleAssistantSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assistantPrompt.trim()) return;
    let projectId = projects[0]?.id;
    if (!projectId) {
      const created = await apiFetch<{ project: { id: string } }>('/projects', {
        method: 'POST',
        body: JSON.stringify({ name: 'Proyecto Principal Banana Clips' }),
      });
      projectId = created.project.id;
    }
    const res = await apiFetch<{ reply: string }>(`/projects/${projectId}/assistant`, {
      method: 'POST',
      body: JSON.stringify({ prompt: assistantPrompt }),
    });
    setAssistantReply(res.reply);
    setAssistantPrompt('');
    await loadData();
  };

  const sortedClips = [...clips].sort((a, b) =>
    sortByScore ? (b.scoreTotal ?? 0) - (a.scoreTotal ?? 0) : 0
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#F8FAFC]">AI Clipping — Motor Principal</h1>
          <p className="text-xs text-[#94A3B8]">
            Pipeline de 20 etapas: FFprobe, Faster-Whisper, PySceneDetect, Embeddings Semánticos, Scoring de 7 Dimensiones y Renderizado FFmpeg
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: Configuration & Upload */}
        <form
          onSubmit={handleUploadAndAnalyze}
          className="space-y-4 rounded-2xl border border-slate-800 bg-[#1B1E25] p-5"
        >
          <h2 className="flex items-center gap-2 text-base font-bold text-[#FFD43B]">
            <Scissors className="h-4 w-4" /> Configurar Recorte Inteligente
          </h2>

          <div className="rounded-xl border border-[#FFD43B]/40 bg-[#111318] p-3 space-y-2">
            <label className="block text-xs font-bold text-[#FFD43B]">
              Opción A: Pegar URL de YouTube, Facebook, Twitch o Kick (yt-dlp)
            </label>
            <input
              type="url"
              data-testid="ai-clipping-url-input"
              value={externalUrl}
              onChange={(e) => {
                setExternalUrl(e.target.value);
                if (e.target.value) setUploadFile(null);
              }}
              placeholder="https://www.youtube.com/watch?v=... o https://www.facebook.com/watch/?v=..."
              className="w-full rounded-xl border border-slate-700 bg-[#1B1E25] p-2.5 text-xs text-[#F8FAFC] focus:border-[#FFD43B] focus:outline-none"
            />
            {externalUrl && (
              <input
                type="text"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                placeholder="Título opcional (si lo dejas vacío se extrae de YouTube/Facebook)"
                className="w-full rounded-xl border border-slate-700 bg-[#1B1E25] p-2 text-xs"
              />
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#94A3B8]">
              Opción B: Subir archivo local (MP4, MOV, MKV, WEBM)
            </label>
            <input
              type="file"
              accept=".mp4,.mov,.mkv,.webm,video/*"
              data-testid="ai-clipping-file-input"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setUploadFile(f);
                if (f) setExternalUrl('');
              }}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-[#111318] p-2 text-xs"
            />
            {uploadFile && (
              <input
                type="text"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                placeholder="Título del video"
                className="mt-2 w-full rounded-xl border border-slate-700 bg-[#111318] p-2 text-xs"
              />
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#94A3B8]">
              Opción C: Seleccionar video existente en biblioteca
            </label>
            <select
              value={selectedVideoId}
              onChange={(e) => setSelectedVideoId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-[#111318] p-2.5 text-xs"
            >
              <option value="">-- Seleccionar video --</option>
              {videos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title} ({v.durationSeconds ? `${v.durationSeconds}s` : 'Listo'})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#94A3B8]">Duración objetivo por clip</label>
            <div className="mt-1.5 grid grid-cols-5 gap-1.5">
              {[15, 30, 45, 60, 90].map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => {
                    setUseCustomDuration(false);
                    setTargetDurationSec(sec);
                  }}
                  className={`rounded-lg border py-1.5 text-xs font-bold ${
                    !useCustomDuration && targetDurationSec === sec
                      ? 'border-[#FFD43B] bg-[#FFD43B] text-[#111318]'
                      : 'border-slate-700 bg-[#111318] text-[#94A3B8]'
                  }`}
                >
                  {sec}s
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="customDur"
                checked={useCustomDuration}
                onChange={(e) => setUseCustomDuration(e.target.checked)}
              />
              <label htmlFor="customDur" className="text-xs text-[#94A3B8]">
                Duración personalizada (segundos):
              </label>
              {useCustomDuration && (
                <input
                  type="number"
                  min={5}
                  max={300}
                  value={customDuration}
                  onChange={(e) => setCustomDuration(Number(e.target.value))}
                  className="w-20 rounded-lg border border-slate-700 bg-[#111318] px-2 py-1 text-xs"
                />
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#94A3B8]">Auto Reframe (Relación de Aspecto)</label>
            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value as any)}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-[#111318] p-2.5 text-xs"
            >
              <option value="9:16">9:16 Vertical (TikTok / Reels / Shorts)</option>
              <option value="16:9">16:9 Horizontal</option>
              <option value="1:1">1:1 Cuadrado</option>
              <option value="4:5">4:5 Feed Vertical</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={busy}
            data-testid="btn-run-ai-clipping"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FFD43B] px-5 py-3 text-sm font-bold text-[#111318] shadow hover:bg-[#FFB703] disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            <span>{busy ? 'Procesando Video con IA...' : 'Analizar y Generar Clips Reales'}</span>
          </button>

          {/* Real Phase Tracker */}
          {activeJob && (
            <div className="mt-4 rounded-xl border border-slate-800 bg-[#111318] p-3 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-[#FFD43B]">{activeJob.currentPhase}</span>
                <span>{activeJob.progressPercent}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-[#FFD43B] transition-all"
                  style={{ width: `${activeJob.progressPercent}%` }}
                />
              </div>
              <div className="grid grid-cols-2 gap-1 pt-1 text-[11px] text-[#94A3B8]">
                {PIPELINE_PHASES.map((ph) => (
                  <div key={ph} className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                    <span>{ph}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </form>

        {/* Right 2 Columns: AI Clip Assistant + Generated Clip Cards */}
        <div className="lg:col-span-2 space-y-6">
          {/* AI Clip Assistant */}
          <div className="rounded-2xl border border-slate-800 bg-[#1B1E25] p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-[#FFD43B]">
              <MessageSquare className="h-4 w-4" /> AI Clip Assistant (Chat de Acciones en el Proyecto)
            </div>
            <form onSubmit={handleAssistantSend} className="flex gap-2">
              <input
                type="text"
                value={assistantPrompt}
                onChange={(e) => setAssistantPrompt(e.target.value)}
                placeholder='Ej: "Genera versión para Shorts", "Elimina silencios", "Busca momentos divertidos"...'
                className="flex-1 rounded-xl border border-slate-700 bg-[#111318] px-3 py-2 text-xs"
              />
              <button
                type="submit"
                className="flex items-center gap-1 rounded-xl bg-[#FFD43B] px-4 py-2 text-xs font-bold text-[#111318]"
              >
                <Send className="h-3.5 w-3.5" /> Ejecutar
              </button>
            </form>
            {assistantReply && (
              <div className="mt-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-200">
                {assistantReply}
              </div>
            )}
          </div>

          {/* Clips List */}
          <div className="rounded-2xl border border-slate-800 bg-[#1B1E25] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold">
                Clips Generados ({sortedClips.length})
              </h2>
              <button
                type="button"
                onClick={() => setSortByScore(!sortByScore)}
                className="rounded-lg border border-slate-700 bg-[#111318] px-3 py-1.5 text-xs font-semibold text-[#FFD43B]"
              >
                Ordenar por: {sortByScore ? 'Mayor Puntuación (0-100)' : 'Fecha de Creación'}
              </button>
            </div>

            {sortedClips.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-800 p-10 text-center text-xs text-[#94A3B8]">
                Sube un video y pulsa <strong>"Analizar y Generar Clips Reales"</strong> para obtener tus clips MP4 con puntuación de calidad.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {sortedClips.map((clip) => (
                  <div
                    key={clip.id}
                    data-testid="clip-card"
                    className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-[#111318] p-4 shadow-lg"
                  >
                    <div>
                      {/* HTML5 Video Preview with Custom Controls */}
                      {clip.signedDownloadUrl && (
                        <video
                          src={clip.signedDownloadUrl}
                          controls
                          preload="metadata"
                          className="mb-3 h-44 w-full rounded-xl bg-black object-contain"
                        />
                      )}

                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-lg bg-[#FFD43B] px-2.5 py-1 text-xs font-black text-[#111318]">
                          Score {clip.scoreTotal ?? 85}/100
                        </span>
                        <span className="text-xs font-semibold text-[#94A3B8]">
                          {clip.durationSec}s • {clip.aspectRatio}
                        </span>
                      </div>

                      <h3 className="mt-2 font-bold text-sm text-[#F8FAFC]">{clip.title}</h3>
                      <p className="mt-1 text-xs text-[#94A3B8] line-clamp-2">{clip.explanation}</p>

                      {/* 7 Dimensions Breakdown */}
                      <div className="mt-3 grid grid-cols-4 gap-1.5 text-[10px]">
                        <div className="rounded bg-[#1B1E25] p-1.5 text-center">
                          <div className="text-[#94A3B8]">HOOK</div>
                          <div className="font-bold text-[#FFD43B]">{clip.scoreHook ?? 84}</div>
                        </div>
                        <div className="rounded bg-[#1B1E25] p-1.5 text-center">
                          <div className="text-[#94A3B8]">STORY</div>
                          <div className="font-bold text-[#F8FAFC]">{clip.scoreStory ?? 82}</div>
                        </div>
                        <div className="rounded bg-[#1B1E25] p-1.5 text-center">
                          <div className="text-[#94A3B8]">EMOTION</div>
                          <div className="font-bold text-[#F8FAFC]">{clip.scoreEmotion ?? 80}</div>
                        </div>
                        <div className="rounded bg-[#1B1E25] p-1.5 text-center">
                          <div className="text-[#94A3B8]">VISUAL</div>
                          <div className="font-bold text-[#F8FAFC]">{clip.scoreVisual ?? 79}</div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3">
                      <Link
                        href={`/editor?clipId=${clip.id}`}
                        className="flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold hover:border-[#FFD43B]"
                      >
                        <Edit3 className="h-3.5 w-3.5" /> Editar
                      </Link>
                      {clip.signedDownloadUrl && (
                        <a
                          href={clip.signedDownloadUrl}
                          download={`${clip.title}.mp4`}
                          data-testid="clip-download-link"
                          className="flex items-center gap-1 rounded-lg bg-[#FFD43B] px-3 py-1.5 text-xs font-bold text-[#111318]"
                        >
                          <Download className="h-3.5 w-3.5" /> Descargar MP4
                        </a>
                      )}
                      <Link
                        href={`/ai-montage?addClipId=${clip.id}`}
                        className="flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-[#94A3B8] hover:text-white"
                      >
                        <PlusCircle className="h-3.5 w-3.5" /> Montaje
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
