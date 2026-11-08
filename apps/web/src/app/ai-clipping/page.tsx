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
  Trash2,
  Subtitles,
  Anchor,
  Layers,
  Smile,
  Film,
  Volume2,
  Wand2,
  Maximize2,
  Palette,
  Globe,
  Languages,
  BookOpen,
  LayoutGrid,
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

const CAPTION_PRESETS = [
  {
    id: 'WordCut',
    template: 'Bold',
    label: 'Word Cut',
    previewTop: 'To get',
    previewBottom: 'started',
    bottomClass: 'text-[#FFD43B] font-black',
  },
  {
    id: 'MarkerSweep',
    template: 'Bold',
    label: 'Marker Sweep',
    previewTop: 'TO GET',
    previewBottom: 'STARTED',
    bottomClass: 'bg-purple-500/80 text-white px-1.5 py-0.5 rounded font-black',
  },
  {
    id: 'NegativeKeywords',
    template: 'Dynamic',
    label: 'Negative keywords',
    previewTop: 'TO GET',
    previewBottom: 'STARTED',
    bottomClass: 'text-orange-400 drop-shadow-[0_0_8px_rgba(251,146,60,0.8)] font-black',
  },
  {
    id: 'Karaoke',
    template: 'Karaoke',
    label: 'Karaoke',
    previewTop: 'TO GET',
    previewBottom: 'STARTED',
    bottomClass: 'text-white underline decoration-[#FFD43B] decoration-2 font-black',
  },
  {
    id: 'Neon',
    template: 'Neon',
    label: 'Neon Glow',
    previewTop: 'TO GET',
    previewBottom: 'STARTED',
    bottomClass: 'text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)] font-black',
  },
  {
    id: 'Gaming',
    template: 'Gaming',
    label: 'Gaming Impact',
    previewTop: 'TO GET',
    previewBottom: 'STARTED',
    bottomClass: 'text-amber-400 italic font-black',
  },
];

function OpusSwitch({
  checked,
  onChange,
  id,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ${
        checked ? 'bg-white' : 'bg-zinc-700'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full transition-transform duration-200 ${
          checked ? 'translate-x-6 bg-[#111318]' : 'translate-x-1 bg-zinc-400'
        }`}
      />
    </button>
  );
}

export default function AiClippingPage() {
  const [videos, setVideos] = useState<any[]>([]);
  const [clips, setClips] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState('');

  // Source inputs
  const [externalUrl, setExternalUrl] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [srtFileName, setSrtFileName] = useState<string | null>(null);

  // Top Card: Speech language, Genre, Adjust Range, Layout
  const [speechLanguage, setSpeechLanguage] = useState('Spanish');
  const [genre, setGenre] = useState('Auto');
  const [rangeStartStr, setRangeStartStr] = useState('0:00:00');
  const [rangeEndStr, setRangeEndStr] = useState('0:03:00');
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9' | '1:1' | '4:5'>('9:16');
  const [layoutVariant, setLayoutVariant] = useState('9:16_fill');

  // Recipe & Brand Kit
  const [recipe, setRecipe] = useState('Clip long video');
  const [brandKitMode, setBrandKitMode] = useState('NONE');
  const [brandWatermarkText, setBrandWatermarkText] = useState('');

  // Clipping section
  const [clippingEnabled, setClippingEnabled] = useState(true);
  const [aiPicksMode, setAiPicksMode] = useState('Auto');
  const [targetDurationSec, setTargetDurationSec] = useState<number>(30);
  const [momentsPrompt, setMomentsPrompt] = useState('');

  // Essentials: Captions, Auto Hook, Motion Graphics (Image Watermark), AI Emojis, Auto B-Roll
  const [burnSubtitles, setBurnSubtitles] = useState<boolean>(true);
  const [captionPresetId, setCaptionPresetId] = useState<string>('WordCut');
  const [subtitleTemplate, setSubtitleTemplate] = useState<string>('Bold');

  const [hookBanner, setHookBanner] = useState<boolean>(true);
  const [hookType, setHookType] = useState<string>('Headline');
  const [hookStyle, setHookStyle] = useState<'Editorial' | 'Statement' | 'Classic'>('Classic');
  const [hookAnimation, setHookAnimation] = useState<
    'ELASTIC_POP' | 'KINETIC_WORDS' | 'SLIDE_IMPACT' | 'NEON_PULSE' | 'TYPEWRITER_SWEEP'
  >('ELASTIC_POP');

  const [motionGraphics, setMotionGraphics] = useState<boolean>(false);
  const [watermarkImagePath, setWatermarkImagePath] = useState<string>('');
  const [watermarkPreviewUrl, setWatermarkPreviewUrl] = useState<string>('');
  const [watermarkFileName, setWatermarkFileName] = useState<string>('');
  const [watermarkPosition, setWatermarkPosition] = useState<string>('TOP_RIGHT');
  const [watermarkScalePx, setWatermarkScalePx] = useState<number>(140);
  const [uploadingWatermark, setUploadingWatermark] = useState<boolean>(false);
  const [autoEmojis, setAutoEmojis] = useState<boolean>(true);
  const [autoBroll, setAutoBroll] = useState<boolean>(true);
  const [brollMode, setBrollMode] = useState<string>('AI video B-roll');

  // Sound sharp: Speech cleanup, Enhance audio, Auto SFX, Viral Background Music
  const [speechCleanup, setSpeechCleanup] = useState<boolean>(true);
  const [speechCleanupMode, setSpeechCleanupMode] = useState<string>('Remove pause & filler words');
  const [audioEnhancer, setAudioEnhancer] = useState<boolean>(true);
  const [autoSfx, setAutoSfx] = useState<boolean>(true);
  const [backgroundMusicTrack, setBackgroundMusicTrack] = useState<string>('NONE');

  // Look good: Auto Zoom, Auto transitions, Auto Color Correction, Split Screen 50/50
  const [autoZoom, setAutoZoom] = useState<boolean>(true);
  const [autoTransitions, setAutoTransitions] = useState<boolean>(true);
  const [autoColorCorrection, setAutoColorCorrection] = useState<boolean>(true);
  const [splitScreenMode, setSplitScreenMode] = useState<string>('NONE');
  const [ctaOutro, setCtaOutro] = useState<boolean>(false);

  // Translate: Voice dubbing & Caption translation
  const [voiceDubbing, setVoiceDubbing] = useState<boolean>(false);
  const [dubbingLanguage, setDubbingLanguage] = useState<string>('English');
  const [captionTranslation, setCaptionTranslation] = useState<boolean>(false);
  const [targetLanguage, setTargetLanguage] = useState<string>('English');

  // Job & Assistant state
  const [activeJob, setActiveJob] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [sortByScore, setSortByScore] = useState(true);
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

  const parseTimeSec = (str: string): number => {
    const parts = (str || '0:00:00').split(':').map((n) => Number(n) || 0);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
  };

  const selectedVideoObj = videos.find((v) => v.id === selectedVideoId) || videos[0] || null;

  const handleWatermarkFileUpload = async (file: File) => {
    setUploadingWatermark(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiFetch<{
        watermark: { id: string; filename: string; watermarkImagePath: string; previewUrl: string };
      }>('/uploads/watermark', {
        method: 'POST',
        body: fd,
      });
      setWatermarkImagePath(res.watermark.watermarkImagePath);
      setWatermarkPreviewUrl(res.watermark.previewUrl);
      setWatermarkFileName(res.watermark.filename);
      setMotionGraphics(true);
    } catch (err: any) {
      alert(err.message || 'Error al subir la imagen de marca de agua.');
    } finally {
      setUploadingWatermark(false);
    }
  };

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
        throw new Error(
          'Pega una URL de YouTube/Facebook, sube un archivo MP4/MOV o selecciona un video de la biblioteca.'
        );
      }

      const rangeStartSec = parseTimeSec(rangeStartStr);
      const rangeEndSec = parseTimeSec(rangeEndStr);

      const jobRes = await apiFetch<{ jobId: string }>('/jobs', {
        method: 'POST',
        body: JSON.stringify({
          videoId: videoIdToProcess,
          jobType: 'AI_CLIPPING',
          targetDurationSec,
          aspectRatio,
          layoutVariant,
          speechLanguage,
          genre,
          recipe,
          rangeStartSec,
          rangeEndSec,
          momentsPrompt,
          burnSubtitles,
          captionPresetId,
          subtitleTemplate,
          hookBanner,
          hookStyle,
          hookAnimation,
          motionGraphics,
          watermarkImagePath: motionGraphics ? watermarkImagePath : '',
          watermarkPosition,
          watermarkScalePx,
          autoEmojis,
          autoBroll,
          brollMode,
          speechCleanup,
          audioEnhancer,
          autoSfx,
          backgroundMusicTrack,
          autoZoom,
          autoTransitions,
          autoColorCorrection,
          splitScreenMode,
          brandWatermarkText: brandKitMode === 'NONE' ? '' : brandWatermarkText,
          ctaOutro,
          voiceDubbing,
          dubbingLanguage,
          captionTranslation,
          targetLanguage,
          videoEffect: autoBroll
            ? 'AI_BROLL_CUTAWAY'
            : autoColorCorrection
              ? 'VIBRANT_BOOST'
              : autoZoom
                ? 'DYNAMIC_ZOOM'
                : autoTransitions
                  ? 'FADE_TRANSITIONS'
                  : 'NONE',
          syncExecution: false,
        }),
      });

      let currentJob: any = {
        id: jobRes.jobId,
        status: 'QUEUED',
        currentPhase: 'Iniciando descarga y análisis (2%)...',
        progressPercent: 2,
      };
      setActiveJob(currentJob);

      while (true) {
        await new Promise((r) => setTimeout(r, 1000));
        try {
          const statusRes = await apiFetch<{ job: any }>(`/jobs/${jobRes.jobId}`);
          if (statusRes?.job) {
            currentJob = statusRes.job;
            const dlPctMatch = (currentJob.currentPhase || '').match(/\((\d+)%\)/);
            if (currentJob.status === 'DOWNLOADING' && dlPctMatch) {
              currentJob = {
                ...currentJob,
                progressPercent: Math.max(2, Math.min(99, parseInt(dlPctMatch[1], 10))),
              };
            }
            setActiveJob(currentJob);
            if (currentJob.status === 'COMPLETED') {
              break;
            }
            if (currentJob.status === 'FAILED' || currentJob.status === 'CANCELED') {
              throw new Error(currentJob.errorMessage || 'El trabajo falló o fue cancelado.');
            }
          }
        } catch (pollErr: any) {
          if (pollErr?.message?.includes('falló') || pollErr?.message?.includes('cancelado')) {
            throw pollErr;
          }
        }
      }

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

  const handleDeleteClip = async (clipId: string, clipTitle?: string) => {
    if (!window.confirm(`¿Eliminar permanentemente "${clipTitle || 'este clip'}" y liberar su espacio en disco?`)) return;
    try {
      await apiFetch(`/clips/${clipId}`, { method: 'DELETE' });
      setClips((prev) => prev.filter((c) => c.id !== clipId));
    } catch (err: any) {
      alert(err?.message || 'Error al eliminar el clip');
    }
  };

  const sortedClips = [...clips].sort((a, b) =>
    sortByScore ? (b.scoreTotal ?? 0) - (a.scoreTotal ?? 0) : 0
  );

  const activePremiumFeatures = [
    hookBanner && `Headline (${hookStyle})`,
    motionGraphics && 'Motion graphics',
    autoEmojis && 'AI Emojis',
    autoBroll && `Auto B-roll (${brollMode})`,
    speechCleanup && 'Speech cleanup',
    audioEnhancer && 'Enhance audio',
    autoSfx && 'Auto SFX',
    autoZoom && 'Auto Zoom',
    autoTransitions && 'Auto transitions',
    autoColorCorrection && 'Auto Color Correction',
    captionTranslation && `Caption translation (${targetLanguage})`,
    voiceDubbing && `Voice dubbing (${dubbingLanguage})`,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-8 pb-12">
      {/* Top Bar: Source Input (YouTube/FB Link, File Upload, Library Selector) */}
      <div className="rounded-2xl border border-zinc-800 bg-[#141417] p-4 shadow-xl">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FFD43B] text-[#111318]">
              <Scissors className="h-4 w-4" />
            </span>
            <div>
              <h1 className="text-lg font-extrabold text-white">AI Clipping Studio — OpusPro Suite</h1>
              <p className="text-[11px] text-zinc-400">
                Pega un link de YouTube / Facebook / Twitch, sube un archivo MP4/MOV o elige un video de tu biblioteca
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-5">
            <label className="mb-1 block text-[11px] font-bold text-[#FFD43B]">
              Pegar URL de YouTube, Facebook, Twitch o Kick (yt-dlp)
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
              className="w-full rounded-xl border border-zinc-700 bg-[#1C1C21] px-3 py-2 text-xs text-white focus:border-[#FFD43B] focus:outline-none"
            />
          </div>

          <div className="md:col-span-4">
            <label className="mb-1 block text-[11px] font-semibold text-zinc-400">
              O subir archivo local (MP4, MOV, MKV, WEBM)
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
              className="w-full rounded-xl border border-zinc-700 bg-[#1C1C21] px-2.5 py-1.5 text-xs text-zinc-300"
            />
          </div>

          <div className="md:col-span-3">
            <label className="mb-1 block text-[11px] font-semibold text-zinc-400">
              O elegir video en biblioteca ({videos.length})
            </label>
            <select
              value={selectedVideoId}
              onChange={(e) => setSelectedVideoId(e.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-[#1C1C21] px-3 py-2 text-xs text-white"
            >
              <option value="">-- Seleccionar video --</option>
              {videos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title} ({v.durationSeconds ? `${v.durationSeconds}s` : 'Listo'})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main 2-Column OpusClip Create Layout */}
      <form onSubmit={handleUploadAndAnalyze} className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* LEFT COLUMN (8 cols): Video Range Card + Recipe / Brand Kit + All OpusClip Settings */}
        <div className="space-y-5 lg:col-span-8">
          {/* 1. Top Video Preview & Adjust Range Card (Exact OpusClip Layout) */}
          <div className="rounded-3xl border border-zinc-800/90 bg-[#18181B] p-5 shadow-2xl">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-12">
              {/* Thumbnail / Preview Box */}
              <div className="md:col-span-5">
                <div className="relative overflow-hidden rounded-2xl border border-zinc-700/70 bg-black">
                  {selectedVideoObj?.signedStreamUrl && !externalUrl && !uploadFile ? (
                    <video
                      src={selectedVideoObj.signedStreamUrl}
                      className="h-40 w-full object-cover"
                      preload="metadata"
                      muted
                    />
                  ) : (
                    <div className="flex h-40 w-full flex-col items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-800 to-amber-500/20 p-4 text-center">
                      <Film className="mb-2 h-8 w-8 text-[#FFD43B]" />
                      <span className="line-clamp-2 text-xs font-extrabold uppercase tracking-wide text-white">
                        {externalUrl
                          ? externalUrl
                          : uploadFile
                            ? uploadFile.name
                            : selectedVideoObj?.title || 'INSTALANDO MI PRIMERA MÁQUINA'}
                      </span>
                    </div>
                  )}
                  <span className="absolute left-2.5 top-2.5 rounded-md bg-black/75 px-2 py-0.5 text-[11px] font-bold text-white backdrop-blur">
                    {selectedVideoObj?.height ? `${selectedVideoObj.height}p` : '1080p'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setExternalUrl('');
                      setUploadFile(null);
                    }}
                    title="Limpiar selección"
                    className="absolute right-2.5 top-2.5 rounded-full bg-black/70 p-1.5 text-zinc-300 hover:text-white"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Speech language & Genre row */}
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
                  <div className="flex items-center gap-1">
                    <span>Speech language:</span>
                    <select
                      value={speechLanguage}
                      onChange={(e) => setSpeechLanguage(e.target.value)}
                      className="bg-transparent font-semibold text-white focus:outline-none"
                    >
                      <option value="Spanish" className="bg-[#18181B]">Spanish</option>
                      <option value="English" className="bg-[#18181B]">English</option>
                      <option value="Portuguese" className="bg-[#18181B]">Portuguese</option>
                      <option value="French" className="bg-[#18181B]">French</option>
                      <option value="Auto" className="bg-[#18181B]">Auto</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-1">
                    <span>Genre:</span>
                    <select
                      value={genre}
                      onChange={(e) => setGenre(e.target.value)}
                      className="bg-transparent font-semibold text-white focus:outline-none"
                    >
                      <option value="Auto" className="bg-[#18181B]">Auto</option>
                      <option value="Vlog" className="bg-[#18181B]">Vlog / IRL</option>
                      <option value="Podcast" className="bg-[#18181B]">Podcast</option>
                      <option value="Gaming" className="bg-[#18181B]">Gaming</option>
                      <option value="Marketing" className="bg-[#18181B]">Marketing</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Right: Adjust range, Filmstrip, Layout & Upload SRT */}
              <div className="flex flex-col justify-between md:col-span-7">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">Adjust range</span>
                    <span className="text-xs font-semibold text-[#FFD43B]">Credit saver • Self-Hosted</span>
                  </div>

                  {/* Visual Filmstrip Scrub Bar */}
                  <div className="relative flex h-11 w-full items-center overflow-hidden rounded-xl border-2 border-white bg-zinc-900 px-2">
                    <div className="grid w-full grid-cols-6 gap-1 opacity-75">
                      {[1, 2, 3, 4, 5, 6].map((idx) => (
                        <div
                          key={idx}
                          className="h-7 rounded bg-gradient-to-r from-zinc-700 via-zinc-600 to-zinc-700"
                        />
                      ))}
                    </div>
                  </div>

                  {/* Start / Middle / End Time Pills */}
                  <div className="grid grid-cols-3 items-center gap-2 text-center">
                    <input
                      type="text"
                      value={rangeStartStr}
                      onChange={(e) => setRangeStartStr(e.target.value)}
                      className="rounded-xl bg-[#232329] py-2 text-center text-xs font-bold text-white focus:outline-none"
                    />
                    <span className="text-xs font-medium text-zinc-400">
                      {selectedVideoObj?.durationSeconds ? `${selectedVideoObj.durationSeconds}s total` : '0:03:00'}
                    </span>
                    <input
                      type="text"
                      value={rangeEndStr}
                      onChange={(e) => setRangeEndStr(e.target.value)}
                      className="rounded-xl bg-[#232329] py-2 text-center text-xs font-bold text-white focus:outline-none"
                    />
                  </div>
                </div>

                {/* Layout & Upload SRT row */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-400">Layout</span>
                    <select
                      value={layoutVariant}
                      onChange={(e) => {
                        const v = e.target.value;
                        setLayoutVariant(v);
                        if (v.startsWith('9:16')) setAspectRatio('9:16');
                        else if (v.startsWith('1:1')) setAspectRatio('1:1');
                        else if (v.startsWith('4:5')) setAspectRatio('4:5');
                        else if (v.startsWith('16:9')) setAspectRatio('16:9');
                      }}
                      className="rounded-lg bg-[#232329] px-2.5 py-1.5 font-semibold text-white focus:outline-none"
                    >
                      <option value="9:16_fill">▯ 9:16, 7 layouts (Fill / Auto Tracking)</option>
                      <option value="9:16_split">▯ 9:16 Split Screen (2 Hablantes)</option>
                      <option value="9:16_blur">▯ 9:16 Fit con Fondo Difuminado</option>
                      <option value="9:16_game">▯ 9:16 Gameplay + Facecam</option>
                      <option value="1:1_square">□ 1:1 Cuadrado</option>
                      <option value="4:5_portrait">▯ 4:5 Retrato Feed</option>
                      <option value="16:9_landscape">▭ 16:9 Horizontal</option>
                    </select>
                  </div>

                  <label className="flex cursor-pointer items-center gap-1.5 text-zinc-400 hover:text-white">
                    <span>{srtFileName ? `SRT: ${srtFileName}` : 'Upload SRT'}</span>
                    <Upload className="h-3.5 w-3.5" />
                    <input
                      type="file"
                      accept=".srt,.vtt"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setSrtFileName(f.name);
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Recipe & Brand Kit + All OpusClip Settings Card */}
          <div className="space-y-6 rounded-3xl border border-zinc-800/90 bg-[#18181B] p-6 shadow-2xl">
            {/* Recipe & Brand kit top 2 boxes */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex items-center justify-between rounded-2xl bg-[#222227] p-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white">
                    <LayoutGrid className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-bold text-white">Recipe</span>
                </div>
                <select
                  value={recipe}
                  onChange={(e) => setRecipe(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-zinc-300 focus:outline-none"
                >
                  <option value="Clip long video" className="bg-[#18181B]">Clip long video</option>
                  <option value="Viral Shorts & Reels" className="bg-[#18181B]">Viral Shorts & Reels</option>
                  <option value="Vlog & IRL Action" className="bg-[#18181B]">Vlog & IRL Action</option>
                  <option value="Gaming Highlights" className="bg-[#18181B]">Gaming Highlights</option>
                </select>
              </div>

              <div className="flex items-center justify-between rounded-2xl bg-[#222227] p-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-bold text-white">Brand kit</span>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={brandKitMode}
                    onChange={(e) => {
                      setBrandKitMode(e.target.value);
                      if (e.target.value === 'NONE') setBrandWatermarkText('');
                      else if (e.target.value === '@BananaClips') setBrandWatermarkText('@BananaClips');
                    }}
                    className="bg-transparent text-xs font-semibold text-zinc-300 focus:outline-none"
                  >
                    <option value="@BananaClips" className="bg-[#18181B]">@BananaClips</option>
                    <option value="CUSTOM" className="bg-[#18181B]">Personalizado...</option>
                    <option value="NONE" className="bg-[#18181B]">No brand kit</option>
                  </select>
                  {brandKitMode === 'CUSTOM' && (
                    <input
                      type="text"
                      value={brandWatermarkText}
                      onChange={(e) => setBrandWatermarkText(e.target.value)}
                      placeholder="@TuCanal"
                      className="w-24 rounded-lg border border-zinc-700 bg-[#18181B] px-2 py-1 text-xs text-white"
                    />
                  )}
                </div>
              </div>
            </div>

            <p className="text-xs text-zinc-400">
              Your Recipe sets which edits run. Your brand kit sets the look, like your logo, intro, outro and caption style.
            </p>

            <div className="text-xs font-semibold text-zinc-300">Recipe settings ^</div>

            {/* CLIPPING SECTION */}
            <div className="space-y-4 border-b border-zinc-800 pb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-[#111318]">
                    <Scissors className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-bold text-white">Clipping</span>
                </div>
                <OpusSwitch checked={clippingEnabled} onChange={setClippingEnabled} />
              </div>

              <div className="flex flex-wrap items-center gap-6 text-xs text-zinc-400">
                <div className="flex items-center gap-1.5">
                  <span>AI picks:</span>
                  <select
                    value={aiPicksMode}
                    onChange={(e) => setAiPicksMode(e.target.value)}
                    className="bg-transparent font-semibold text-white focus:outline-none"
                  >
                    <option value="Auto" className="bg-[#18181B]">Auto</option>
                    <option value="Viral85" className="bg-[#18181B]">High Virality (85+)</option>
                    <option value="BestHooks" className="bg-[#18181B]">Best Opening Hooks</option>
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <span>Clip length:</span>
                  <select
                    value={targetDurationSec}
                    onChange={(e) => setTargetDurationSec(Number(e.target.value))}
                    className="bg-transparent font-semibold text-white focus:outline-none"
                  >
                    <option value={15} className="bg-[#18181B]">15s (Fast Shorts)</option>
                    <option value={30} className="bg-[#18181B]">Auto 30s (0m-3m)</option>
                    <option value={45} className="bg-[#18181B]">45s (Story Clip)</option>
                    <option value={60} className="bg-[#18181B]">60s (1 Min Completo)</option>
                    <option value={90} className="bg-[#18181B]">90s (Extendida)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>Moments to include (optional)</span>
                  <span className="text-[11px] text-zinc-500">How to prompt ⓘ</span>
                </div>
                <input
                  type="text"
                  value={momentsPrompt}
                  onChange={(e) => setMomentsPrompt(e.target.value)}
                  placeholder="Example: Compile all the hilarious moments, o escribe el tema que quieres recortar..."
                  className="w-full rounded-xl border border-zinc-800 bg-[#222227] px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:border-zinc-600 focus:outline-none"
                />
              </div>
            </div>

            {/* ESSENTIALS: CAPTIONS, AUTO HOOK, MOTION GRAPHICS, AI EMOJIS, AUTO B-ROLL */}
            <div className="space-y-6 border-b border-zinc-800 pb-6">
              <div className="text-xs font-semibold text-zinc-400">Essentials</div>

              {/* Captions + Visual Cards */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-[#111318]">
                      <Subtitles className="h-4 w-4" />
                    </div>
                    <span className="text-sm font-bold text-white">Captions</span>
                  </div>
                  <OpusSwitch checked={burnSubtitles} onChange={setBurnSubtitles} />
                </div>

                {burnSubtitles && (
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-6">
                    {CAPTION_PRESETS.map((preset) => {
                      const isSelected = captionPresetId === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            setCaptionPresetId(preset.id);
                            setSubtitleTemplate(preset.template);
                          }}
                          className="group flex flex-col items-center space-y-1.5 text-center"
                        >
                          <div
                            className={`relative flex h-24 w-full flex-col items-center justify-center rounded-2xl border p-2 transition ${
                              isSelected
                                ? 'border-2 border-white bg-[#27272D]'
                                : 'border-zinc-800 bg-[#222227] hover:border-zinc-700'
                            }`}
                          >
                            {isSelected && (
                              <span className="absolute left-2 top-1.5 text-[10px] font-bold text-zinc-300">
                                Selected
                              </span>
                            )}
                            <span className="text-xs font-extrabold leading-tight text-white">
                              {preset.previewTop}
                            </span>
                            <span className={`mt-0.5 text-xs leading-tight ${preset.bottomClass}`}>
                              {preset.previewBottom}
                            </span>
                          </div>
                          <span className="text-[11px] font-medium text-zinc-400 group-hover:text-white">
                            {preset.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Auto hook (Animated) + 5 Kinetic Motion Modes + 3 Visual Portrait Cards */}
              <div className="space-y-3.5 pt-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#FFD43B] to-[#FFB703] text-[#111318] shadow">
                      <Anchor className="h-4 w-4" />
                    </div>
                    <span className="text-sm font-bold text-white">Auto hook (Animado)</span>
                    <span className="rounded-full border border-[#FFD43B]/40 bg-[#FFD43B]/15 px-2.5 py-0.5 text-[10px] font-extrabold text-[#FFD43B]">
                      ⚡ Kinetic 24fps
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <select
                      value={hookType}
                      onChange={(e) => setHookType(e.target.value)}
                      className="bg-transparent text-xs font-semibold text-zinc-300 focus:outline-none"
                    >
                      <option value="Headline" className="bg-[#18181B]">Headline Animado</option>
                      <option value="VisualHook" className="bg-[#18181B]">Viral Hook Banner + Badge</option>
                    </select>
                    <OpusSwitch checked={hookBanner} onChange={setHookBanner} />
                  </div>
                </div>

                {hookBanner && (
                  <div className="space-y-3 rounded-2xl border border-zinc-800/80 bg-[#1B1E25]/60 p-3.5">
                    {/* 5 Hook Animation Mode Selector Pills */}
                    <div>
                      <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                        Estilo de Animación del Hook (Primeros 3.8s del Short)
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { id: 'ELASTIC_POP', label: '⚡ Elastic Pop 3D', desc: 'Rebote elástico + giro dinámico' },
                          { id: 'KINETIC_WORDS', label: '🔥 Kinetic Words', desc: '3 líneas en cascada (Hormozi)' },
                          { id: 'SLIDE_IMPACT', label: '💥 Slide + Impact', desc: 'Caída rápida con golpe visual' },
                          { id: 'NEON_PULSE', label: '✨ Neon Cyber Pulse', desc: 'Desenfoque a brillo neón pulsante' },
                          { id: 'TYPEWRITER_SWEEP', label: '⌨️ Typewriter Sweep', desc: 'Barrido palabra por palabra' },
                        ].map((anim) => {
                          const isAnimSelected = hookAnimation === anim.id;
                          return (
                            <button
                              key={anim.id}
                              type="button"
                              onClick={() => setHookAnimation(anim.id as any)}
                              title={anim.desc}
                              className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                                isAnimSelected
                                  ? 'border-[#FFD43B] bg-[#FFD43B]/20 text-[#FFD43B] shadow-sm'
                                  : 'border-zinc-800 bg-[#131720] text-zinc-400 hover:border-zinc-700 hover:text-white'
                              }`}
                            >
                              {anim.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 3 Animated Visual Portrait Cards */}
                    <div className="flex flex-wrap gap-3.5 pt-1">
                      {[
                        {
                          id: 'Editorial',
                          label: 'Editorial',
                          bg: 'from-stone-700 via-amber-900/50 to-zinc-900',
                          renderText: (
                            <div
                              className={`mt-6 text-center font-serif italic ${
                                hookAnimation === 'SLIDE_IMPACT'
                                  ? 'animate-hook-slide'
                                  : hookAnimation === 'NEON_PULSE'
                                    ? 'animate-hook-neon'
                                    : 'animate-hook-elastic'
                              }`}
                            >
                              <div className="mb-1 inline-block rounded bg-[#FFD43B] px-1.5 py-0.5 font-sans text-[7px] font-black not-italic text-black">
                                ⚡ VIRAL HOOK
                              </div>
                              <div className="text-[10px] text-amber-200">The</div>
                              <div className="text-sm font-bold text-white">beauty</div>
                              <div className="text-[9px] text-amber-300">of creation</div>
                            </div>
                          ),
                        },
                        {
                          id: 'Statement',
                          label: 'Statement',
                          bg: 'from-blue-950 via-indigo-900/60 to-zinc-900',
                          renderText: (
                            <div
                              className={`mt-6 text-left ${
                                hookAnimation === 'SLIDE_IMPACT'
                                  ? 'animate-hook-slide'
                                  : hookAnimation === 'NEON_PULSE'
                                    ? 'animate-hook-neon'
                                    : 'animate-hook-elastic'
                              }`}
                            >
                              <div className="mb-1 inline-block rounded bg-[#FFD43B] px-1.5 py-0.5 text-[7px] font-black text-black">
                                ⚡ VIRAL HOOK
                              </div>
                              <div className="text-[9px] font-bold text-[#FFD43B]">Stop waiting.</div>
                              <div className="text-xs font-black leading-tight text-white">
                                Start
                                <br />
                                <span className="text-cyan-300">creating.</span>
                              </div>
                            </div>
                          ),
                        },
                        {
                          id: 'Classic',
                          label: 'Classic',
                          bg: 'from-sky-900/60 via-zinc-800 to-orange-900/50',
                          renderText: (
                            <div
                              className={`mb-6 flex flex-col items-center gap-1 ${
                                hookAnimation === 'SLIDE_IMPACT'
                                  ? 'animate-hook-slide'
                                  : hookAnimation === 'NEON_PULSE'
                                    ? 'animate-hook-neon'
                                    : 'animate-hook-elastic'
                              }`}
                            >
                              <span className="rounded bg-[#FFD43B] px-1.5 py-0.5 text-[7px] font-black text-black shadow">
                                ⚡ VIRAL HOOK
                              </span>
                              <div className="rounded-md bg-white px-2 py-1 text-center text-[8px] font-black uppercase leading-tight text-black shadow-lg">
                                ANIMATED AUTO
                                <br />
                                <span className="text-amber-600">HEADLINE</span>
                              </div>
                            </div>
                          ),
                        },
                      ].map((card) => {
                        const active = hookStyle === card.id;
                        return (
                          <button
                            key={card.id}
                            type="button"
                            onClick={() => setHookStyle(card.id as any)}
                            className="flex flex-col items-center space-y-1.5"
                          >
                            <div
                              className={`flex h-36 w-28 flex-col items-center justify-center overflow-hidden rounded-2xl border bg-gradient-to-b p-2 transition ${
                                card.bg
                              } ${
                                active
                                  ? 'border-2 border-[#FFD43B] shadow-lg shadow-[#FFD43B]/20'
                                  : 'border-zinc-800 opacity-80 hover:opacity-100'
                              }`}
                            >
                              {card.renderText}
                            </div>
                            <span
                              className={`text-[11px] font-bold ${
                                active ? 'text-[#FFD43B]' : 'text-zinc-400'
                              }`}
                            >
                              {card.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Motion graphics (Custom Image / Logo Watermark Overlay) */}
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#27272D] text-zinc-300">
                      <Layers className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">Motion graphics</span>
                        <span className="text-xs text-[#FFD43B]">👑</span>
                        <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-zinc-300">
                          Marca de Agua / Logo
                        </span>
                      </div>
                      <span className="text-[11px] text-zinc-400">
                        Sube una imagen PNG, JPG o WEBP para incrustarla como marca de agua en tus clips
                      </span>
                    </div>
                  </div>
                  <OpusSwitch checked={motionGraphics} onChange={setMotionGraphics} />
                </div>

                {motionGraphics && (
                  <div className="rounded-2xl border border-zinc-800 bg-[#222227] p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#FFD43B] px-3.5 py-2 text-xs font-extrabold text-[#111318] transition hover:bg-amber-300">
                        {uploadingWatermark ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" /> Subiendo imagen...
                          </>
                        ) : (
                          <>
                            <Upload className="h-4 w-4" /> Subir Imagen / Logo (PNG, JPG, WEBP)
                          </>
                        )}
                        <input
                          type="file"
                          accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleWatermarkFileUpload(f);
                          }}
                        />
                      </label>

                      {watermarkFileName ? (
                        <div className="flex items-center gap-2.5 rounded-xl border border-zinc-700 bg-[#18181B] px-3 py-1.5">
                          {watermarkPreviewUrl && (
                            <img
                              src={watermarkPreviewUrl}
                              alt="Marca de agua"
                              className="h-7 w-7 rounded object-contain bg-zinc-900"
                            />
                          )}
                          <span className="text-xs font-semibold text-emerald-400">
                            ✓ {watermarkFileName}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setWatermarkImagePath('');
                              setWatermarkPreviewUrl('');
                              setWatermarkFileName('');
                            }}
                            className="text-zinc-400 hover:text-red-400"
                            title="Quitar imagen"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-400">
                          Ninguna imagen seleccionada todavía (recomendado: PNG transparente)
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold text-zinc-400">
                          Posición de la marca de agua
                        </label>
                        <select
                          value={watermarkPosition}
                          onChange={(e) => setWatermarkPosition(e.target.value)}
                          className="w-full rounded-xl border border-zinc-700 bg-[#18181B] px-3 py-2 text-xs font-semibold text-white focus:outline-none"
                        >
                          <option value="TOP_RIGHT">Arriba a la derecha</option>
                          <option value="TOP_LEFT">Arriba a la izquierda</option>
                          <option value="BOTTOM_RIGHT">Abajo a la derecha</option>
                          <option value="BOTTOM_LEFT">Abajo a la izquierda</option>
                          <option value="BOTTOM_CENTER">Abajo al centro</option>
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-[11px] font-semibold text-zinc-400">
                          Tamaño del logo en el video
                        </label>
                        <select
                          value={watermarkScalePx}
                          onChange={(e) => setWatermarkScalePx(Number(e.target.value))}
                          className="w-full rounded-xl border border-zinc-700 bg-[#18181B] px-3 py-2 text-xs font-semibold text-white focus:outline-none"
                        >
                          <option value={95}>Pequeño (Discreto - 95px)</option>
                          <option value={140}>Mediano (Estándar - 140px)</option>
                          <option value={200}>Grande (Destacado - 200px)</option>
                          <option value={260}>Extra Grande (Banner - 260px)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* AI Emojis */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#27272D] text-zinc-300">
                    <Smile className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-bold text-white">AI Emojis</span>
                </div>
                <OpusSwitch checked={autoEmojis} onChange={setAutoEmojis} />
              </div>

              {/* Auto B-roll */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#27272D] text-zinc-300">
                    <Film className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-bold text-white">Auto B-roll</span>
                  <span className="text-xs text-[#FFD43B]">👑</span>
                </div>
                <div className="flex items-center gap-3">
                  <select
                    value={brollMode}
                    onChange={(e) => setBrollMode(e.target.value)}
                    className="bg-transparent text-xs font-semibold text-zinc-300 focus:outline-none"
                  >
                    <option value="AI video B-roll" className="bg-[#18181B]">AI video B-roll 👑</option>
                    <option value="Stock B-roll" className="bg-[#18181B]">Stock B-roll</option>
                  </select>
                  <OpusSwitch checked={autoBroll} onChange={setAutoBroll} />
                </div>
              </div>
            </div>

            {/* SOUND SHARP SECTION */}
            <div className="space-y-5 border-b border-zinc-800 pb-6">
              <div className="text-xs font-semibold text-zinc-400">Sound sharp</div>

              {/* Speech cleanup */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#27272D] text-zinc-300">
                    <Wand2 className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-bold text-white">Speech cleanup</span>
                  <span className="text-xs text-[#FFD43B]">👑</span>
                </div>
                <div className="flex items-center gap-3">
                  <select
                    value={speechCleanupMode}
                    onChange={(e) => setSpeechCleanupMode(e.target.value)}
                    className="bg-transparent text-xs font-semibold text-zinc-300 focus:outline-none"
                  >
                    <option value="Remove pause & filler words" className="bg-[#18181B]">
                      Remove pause & filler words
                    </option>
                    <option value="Remove silences only" className="bg-[#18181B]">
                      Remove silences only
                    </option>
                  </select>
                  <OpusSwitch checked={speechCleanup} onChange={setSpeechCleanup} />
                </div>
              </div>

              {/* Enhance audio */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#27272D] text-zinc-300">
                    <Volume2 className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-bold text-white">Enhance audio</span>
                  <span className="text-xs text-[#FFD43B]">👑</span>
                </div>
                <OpusSwitch checked={audioEnhancer} onChange={setAudioEnhancer} />
              </div>

              {/* Auto SFX */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#27272D] text-zinc-300">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-bold text-white">Auto SFX & B-Roll Callouts</span>
                  <span className="text-xs text-[#FFD43B]">👑</span>
                </div>
                <OpusSwitch checked={autoSfx} onChange={setAutoSfx} />
              </div>

              {/* Viral Background Music with Auto-Ducking */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#27272D] text-[#FFD43B]">
                    🎵
                  </div>
                  <span className="text-sm font-bold text-white">Música Viral (Auto-Ducking)</span>
                </div>
                <select
                  value={backgroundMusicTrack}
                  onChange={(e) => setBackgroundMusicTrack(e.target.value)}
                  className="rounded-lg border border-zinc-700 bg-[#18181B] px-2.5 py-1.5 text-xs font-bold text-[#FFD43B]"
                >
                  <option value="NONE">Sin Música</option>
                  <option value="BREAKING_TENSION">🚨 Breaking Tension</option>
                  <option value="PHONK_DRIFT">🔥 Phonk Drift</option>
                  <option value="EPIC_CINEMA">🎬 Épico Cine</option>
                  <option value="COMEDY_BOUNCE">😂 Comedia</option>
                  <option value="LOFI_CHILL">☕ Lo-Fi Chill</option>
                </select>
              </div>
            </div>

            {/* LOOK GOOD SECTION */}
            <div className="space-y-5 border-b border-zinc-800 pb-6">
              <div className="text-xs font-semibold text-zinc-400">Look good</div>

              {/* Split-Screen 50/50 Hypnotic Retention */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#27272D] text-[#FFD43B]">
                    🎮
                  </div>
                  <span className="text-sm font-bold text-white">Pantalla Dividida 50/50 (Retención)</span>
                </div>
                <select
                  value={splitScreenMode}
                  onChange={(e) => setSplitScreenMode(e.target.value)}
                  className="rounded-lg border border-zinc-700 bg-[#18181B] px-2.5 py-1.5 text-xs font-bold text-[#FFD43B]"
                >
                  <option value="NONE">9:16 Normal</option>
                  <option value="HYPNOTIC_TUNNEL">🌀 Túnel Hipnótico 50/50</option>
                  <option value="NEON_RAMP">🌈 Rampa Neón 50/50</option>
                  <option value="GAMEPLAY_PARKOUR">🕹️ Arcade Loop 50/50</option>
                </select>
              </div>

              {/* Auto Zoom */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#27272D] text-zinc-300">
                    <Maximize2 className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-bold text-white">Auto Zoom</span>
                  <span className="text-xs text-[#FFD43B]">👑</span>
                </div>
                <OpusSwitch checked={autoZoom} onChange={setAutoZoom} />
              </div>

              {/* Auto transitions */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#27272D] text-zinc-300">
                    <Layers className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-bold text-white">Auto transitions</span>
                  <span className="text-xs text-[#FFD43B]">👑</span>
                </div>
                <OpusSwitch checked={autoTransitions} onChange={setAutoTransitions} />
              </div>

              {/* Auto Color Correction */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#27272D] text-zinc-300">
                    <Palette className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-bold text-white">Auto Color Correction</span>
                  <span className="text-xs text-[#FFD43B]">👑</span>
                </div>
                <OpusSwitch checked={autoColorCorrection} onChange={setAutoColorCorrection} />
              </div>
            </div>

            {/* TRANSLATE SECTION */}
            <div className="space-y-5">
              <div className="text-xs font-semibold text-zinc-400">Translate</div>

              {/* Voice dubbing */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#27272D] text-zinc-300">
                    <Globe className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-bold text-white">Voice dubbing</span>
                  <span className="text-xs text-[#FFD43B]">👑</span>
                </div>
                <div className="flex items-center gap-3">
                  <select
                    value={dubbingLanguage}
                    onChange={(e) => setDubbingLanguage(e.target.value)}
                    className="bg-transparent text-xs font-semibold text-zinc-300 focus:outline-none"
                  >
                    <option value="English" className="bg-[#18181B]">English</option>
                    <option value="Spanish" className="bg-[#18181B]">Spanish</option>
                    <option value="Portuguese" className="bg-[#18181B]">Portuguese</option>
                    <option value="French" className="bg-[#18181B]">French</option>
                  </select>
                  <OpusSwitch checked={voiceDubbing} onChange={setVoiceDubbing} />
                </div>
              </div>

              {/* Caption translation */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#27272D] text-zinc-300">
                    <Languages className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-bold text-white">Caption translation</span>
                </div>
                <div className="flex items-center gap-3">
                  <select
                    value={targetLanguage}
                    onChange={(e) => setTargetLanguage(e.target.value)}
                    className="bg-transparent text-xs font-semibold text-zinc-300 focus:outline-none"
                  >
                    <option value="English" className="bg-[#18181B]">English</option>
                    <option value="Spanish" className="bg-[#18181B]">Spanish</option>
                    <option value="Portuguese" className="bg-[#18181B]">Portuguese</option>
                    <option value="French" className="bg-[#18181B]">French</option>
                  </select>
                  <OpusSwitch checked={captionTranslation} onChange={setCaptionTranslation} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT STICKY SUMMARY COLUMN (4 cols) */}
        <div className="space-y-5 lg:col-span-4">
          <div className="sticky top-6 space-y-5">
            <div className="rounded-3xl border border-zinc-800/90 bg-[#141417] p-6 shadow-2xl">
              <h2 className="text-sm font-bold text-white">Summary</h2>

              <div className="mt-4 space-y-2.5 border-b border-zinc-800 pb-4 text-xs">
                <div className="flex items-center justify-between text-zinc-400">
                  <span>Video processing ⓘ ⚡</span>
                  <span className="font-semibold text-zinc-200">Self-Hosted GPU</span>
                </div>
                <div className="flex items-center justify-between text-zinc-400">
                  <span>Clipping ({targetDurationSec}s)</span>
                  <span className="font-semibold text-zinc-200">Free</span>
                </div>
                <div className="flex items-center justify-between text-zinc-400">
                  <span>Captions ({captionPresetId})</span>
                  <span className="font-semibold text-zinc-200">{burnSubtitles ? 'Free' : 'Off'}</span>
                </div>
              </div>

              <div className="mt-4 space-y-2 border-b border-zinc-800 pb-4 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">Premium features</span>
                  <span className="text-[11px] font-semibold text-zinc-300">Applied to top 10 clips ▾</span>
                </div>
                {activePremiumFeatures.map((feat) => (
                  <div key={feat} className="flex items-center justify-between text-zinc-400">
                    <span>{feat}</span>
                    <span className="text-zinc-300">Free</span>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between text-sm font-bold">
                <span className="text-white">Total</span>
                <span className="text-[#FFD43B]">⚡ 0 credits (Ilimitado)</span>
              </div>

              <button
                type="submit"
                disabled={busy}
                data-testid="btn-run-ai-clipping"
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3.5 text-sm font-extrabold text-[#111318] shadow-lg transition hover:bg-[#FFD43B] disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                <span>{busy ? 'Procesando Video con IA...' : 'Create'}</span>
              </button>

              <p className="mt-3 text-center text-[11px] text-zinc-500">
                By continuing, you confirm you have rights to use this video.
              </p>

              {/* Real Phase Progress Bar */}
              {activeJob && (
                <div className="mt-4 rounded-2xl border border-zinc-800 bg-[#1C1C21] p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-[#FFD43B]">{activeJob.currentPhase}</span>
                    <span className="text-white">{activeJob.progressPercent}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="h-full bg-[#FFD43B] transition-all"
                      style={{ width: `${activeJob.progressPercent}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-1 pt-1 text-[10px] text-zinc-400">
                    {PIPELINE_PHASES.map((ph) => (
                      <div key={ph} className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                        <span>{ph}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* AI Clip Assistant Card */}
            <div className="rounded-3xl border border-zinc-800 bg-[#18181B] p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold text-[#FFD43B]">
                <MessageSquare className="h-4 w-4" /> AI Clip Assistant
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={assistantPrompt}
                  onChange={(e) => setAssistantPrompt(e.target.value)}
                  placeholder='Ej: "Genera versión para Shorts", "Elimina silencios"...'
                  className="flex-1 rounded-xl border border-zinc-700 bg-[#111318] px-3 py-2 text-xs text-white"
                />
                <button
                  type="button"
                  onClick={handleAssistantSend}
                  className="flex items-center gap-1 rounded-xl bg-[#FFD43B] px-3.5 py-2 text-xs font-bold text-[#111318]"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
              {assistantReply && (
                <div className="mt-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-200">
                  {assistantReply}
                </div>
              )}
            </div>
          </div>
        </div>
      </form>

      {/* GENERATED CLIPS SECTION */}
      <div className="rounded-3xl border border-zinc-800 bg-[#18181B] p-6 shadow-2xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-white">
              Clips Generados ({sortedClips.length})
            </h2>
            <p className="text-xs text-zinc-400">
              Con Subtítulos Animados Quemados (ASS), Banner de Hook Viral, AI B-Roll, Audio Enhancer y Exportación XML
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSortByScore(!sortByScore)}
            className="rounded-xl border border-zinc-700 bg-[#111318] px-3.5 py-2 text-xs font-semibold text-[#FFD43B]"
          >
            Ordenar por: {sortByScore ? 'Virality Score™ (0-100)' : 'Fecha de Creación'}
          </button>
        </div>

        {sortedClips.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-800 p-12 text-center text-xs text-zinc-400">
            Pega un enlace de YouTube/Facebook o selecciona un video arriba y pulsa <strong>"Create"</strong> para generar tus clips virales.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {sortedClips.map((clip) => (
              <div
                key={clip.id}
                data-testid="clip-card"
                className="flex flex-col justify-between rounded-2xl border border-zinc-800 bg-[#111318] p-4 shadow-lg"
              >
                <div>
                  {clip.signedDownloadUrl && (
                    <video
                      src={clip.signedDownloadUrl}
                      controls
                      preload="metadata"
                      className="mb-3 h-56 w-full rounded-xl bg-black object-contain"
                    />
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-lg bg-[#FFD43B] px-2.5 py-1 text-xs font-black text-[#111318]">
                      Score {clip.scoreTotal ?? 88}/100
                    </span>
                    <span className="text-xs font-semibold text-zinc-400">
                      {clip.durationSec}s • {clip.aspectRatio}
                    </span>
                  </div>

                  <h3 className="mt-2 font-bold text-sm text-white">{clip.title}</h3>
                  <p className="mt-1 text-xs text-zinc-400 line-clamp-2">{clip.explanation}</p>

                  <div className="mt-3 grid grid-cols-4 gap-1.5 text-[10px]">
                    <div className="rounded bg-[#1B1E25] p-1.5 text-center">
                      <div className="text-zinc-400">HOOK</div>
                      <div className="font-bold text-[#FFD43B]">{clip.scoreHook ?? 86}</div>
                    </div>
                    <div className="rounded bg-[#1B1E25] p-1.5 text-center">
                      <div className="text-zinc-400">STORY</div>
                      <div className="font-bold text-white">{clip.scoreStory ?? 84}</div>
                    </div>
                    <div className="rounded bg-[#1B1E25] p-1.5 text-center">
                      <div className="text-zinc-400">EMOTION</div>
                      <div className="font-bold text-white">{clip.scoreEmotion ?? 82}</div>
                    </div>
                    <div className="rounded bg-[#1B1E25] p-1.5 text-center">
                      <div className="text-zinc-400">VISUAL</div>
                      <div className="font-bold text-white">{clip.scoreVisual ?? 85}</div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 pt-3">
                  <Link
                    href={`/editor?clipId=${clip.id}`}
                    className="flex items-center gap-1 rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs font-semibold hover:border-[#FFD43B]"
                  >
                    <Edit3 className="h-3.5 w-3.5" /> Editar
                  </Link>
                  <a
                    href={`/api/v1/clips/${clip.id}/xml`}
                    download={`${clip.title}.xml`}
                    className="flex items-center gap-1 rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs font-semibold text-[#FFD43B] hover:border-[#FFD43B]"
                    title="Exportar XML para Premiere Pro / DaVinci Resolve"
                  >
                    <Download className="h-3.5 w-3.5" /> XML
                  </a>
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
                    className="flex items-center gap-1 rounded-lg border border-zinc-700 px-2 py-1.5 text-xs text-zinc-400 hover:text-white"
                  >
                    <PlusCircle className="h-3.5 w-3.5" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDeleteClip(clip.id, clip.title)}
                    className="flex items-center gap-1 rounded-lg border border-red-500/40 bg-red-500/15 px-2.5 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/30"
                    title="Eliminar clip permanentemente del disco"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
