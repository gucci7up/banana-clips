'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/store';
import {
  Search,
  Sparkles,
  Clock,
  Scissors,
  CheckCircle2,
  Flame,
  Play,
  Eye,
  Loader2,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

const SUGGESTED_QUERIES = [
  'Encuentra cuando el presentador se ríe',
  'Busca las mejores eliminaciones de Fortnite',
  'Encuentra cuando hablan de dinero',
  'Encuentra la parte donde el invitado cuenta una historia impactante',
  'Busca todas las veces que alguien menciona inteligencia artificial',
  'Encuentra momentos con celebraciones',
];

const VIRAL_NICHES = [
  { id: 'ALL', label: '🔥 Top Virales en Todo YouTube Hoy' },
  { id: 'STREAMERS_GAMING', label: '🎮 Streamers, Kick & GTA RP (Split 9:16)' },
  { id: 'PODCASTS_SHOWS', label: '🎙️ Podcasts & Entrevistas Explosivas' },
  { id: 'DEPORTES_ACCION', label: '⚾ Deportes, MLB, NBA & Fútbol' },
  { id: 'DIRECTOS_VIVO', label: '🔴 Directos En Vivo Ahora' },
  { id: 'URBANO_MUSICA', label: '🎵 Música Urbana & Tendencias' },
];

export default function FindMomentsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'YOUTUBE_RADAR' | 'SEMANTIC_LIBRARY'>('YOUTUBE_RADAR');

  // YouTube Viral Radar & Direct Search state
  const [niche, setNiche] = useState('ALL');
  const [ytSearchQuery, setYtSearchQuery] = useState('');
  const [ytVideos, setYtVideos] = useState<any[]>([]);
  const [aiSummaryEs, setAiSummaryEs] = useState('');
  const [ytLoading, setYtLoading] = useState(false);
  const [previewVideo, setPreviewVideo] = useState<any | null>(null);
  const [clippingVideoId, setClippingVideoId] = useState<string | null>(null);

  // Semantic pgvector state
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [creatingClipFor, setCreatingClipFor] = useState<string | null>(null);

  const loadTrendingRadar = async (selectedNiche: string) => {
    setNiche(selectedNiche);
    setYtLoading(true);
    try {
      const res = await apiFetch<{ niche: string; aiSummaryEs: string; videos: any[] }>(
        `/youtube/trending-viral?niche=${encodeURIComponent(selectedNiche)}&limit=12`
      );
      setYtVideos(res.videos || []);
      setAiSummaryEs(res.aiSummaryEs || '');
    } finally {
      setYtLoading(false);
    }
  };

  const runDirectYouTubeSearch = async (qText: string) => {
    const clean = qText.trim() || '@Alofokeradioshow';
    setYtSearchQuery(clean);
    setYtLoading(true);
    try {
      const res = await apiFetch<{ videos: any[] }>(`/youtube/search?q=${encodeURIComponent(clean)}&limit=12`);
      setYtVideos(res.videos || []);
      setAiSummaryEs(
        `Resultados en directo de YouTube para "${clean}" analizados con puntuación de potencial viral IA.`
      );
    } finally {
      setYtLoading(false);
    }
  };

  useEffect(() => {
    loadTrendingRadar('ALL');
  }, []);

  const handleClipYouTubeVideoNow = async (yt: any) => {
    setClippingVideoId(yt.videoId);
    try {
      const urlUp = await apiFetch<{ video: { id: string } }>('/uploads/from-url', {
        method: 'POST',
        body: JSON.stringify({
          url: yt.url,
          title: yt.title,
        }),
      });
      await apiFetch('/jobs', {
        method: 'POST',
        body: JSON.stringify({
          videoId: urlUp.video.id,
          jobType: 'AI_CLIPPING',
          targetDurationSec: 30,
          aspectRatio: '9:16',
          splitScreenMode:
            yt.recommendedMode === 'STREAMER_FACECAM_SPLIT'
              ? 'STREAMER_FACECAM_SPLIT'
              : yt.recommendedMode === 'WIDE_ACTION_BLUR'
                ? 'WIDE_ACTION_BLUR'
                : 'NONE',
          facecamCorner: yt.recommendedFacecamCorner || 'AUTO',
          maxClipsCount: 3,
          burnSubtitles: true,
          hookBanner: true,
          syncExecution: false,
        }),
      });
      router.push('/ai-clipping');
    } catch (err: any) {
      alert(err?.message || 'Error al enviar el video a clipear');
    } finally {
      setClippingVideoId(null);
    }
  };

  const runSearch = async (qText: string) => {
    setQuery(qText);
    setLoading(true);
    try {
      const res = await apiFetch<{ results: any[] }>('/find-moments', {
        method: 'POST',
        body: JSON.stringify({ query: qText }),
      });
      setResults(res.results || []);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClipFromMoment = async (item: any) => {
    setCreatingClipFor(item.id);
    try {
      await apiFetch('/jobs', {
        method: 'POST',
        body: JSON.stringify({
          videoId: item.videoId,
          jobType: 'AI_CLIPPING',
          targetDurationSec: 15,
          aspectRatio: '9:16',
          syncExecution: true,
        }),
      });
      router.push('/ai-clipping');
    } finally {
      setCreatingClipFor(null);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#F8FAFC]">
            🔥 Radar IA de Videos Más Virales en YouTube & Buscador de Momentos
          </h1>
          <p className="text-xs text-[#94A3B8]">
            La IA analiza YouTube en tiempo real, detecta los videos más virales con mayor velocidad de vistas y te permite previsualizarlos y clipearlos en 1 clic
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('YOUTUBE_RADAR')}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-extrabold transition ${
              activeTab === 'YOUTUBE_RADAR'
                ? 'bg-gradient-to-r from-red-600 to-amber-500 text-white shadow-lg'
                : 'border border-slate-700 bg-[#1B1E25] text-slate-300 hover:text-white'
            }`}
          >
            <Flame className="h-4 w-4" /> Radar Viral de YouTube (IA)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('SEMANTIC_LIBRARY')}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-extrabold transition ${
              activeTab === 'SEMANTIC_LIBRARY'
                ? 'bg-[#FFD43B] text-[#111318]'
                : 'border border-slate-700 bg-[#1B1E25] text-slate-300 hover:text-white'
            }`}
          >
            <Search className="h-4 w-4" /> Buscar en Mi Biblioteca (pgvector)
          </button>
        </div>
      </div>

      {activeTab === 'YOUTUBE_RADAR' ? (
        <div className="space-y-5">
          {/* Direct YouTube Search Input inside Radar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runDirectYouTubeSearch(ytSearchQuery);
            }}
            className="flex flex-col gap-3 sm:flex-row"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-3 h-4 w-4 text-[#94A3B8]" />
              <input
                type="text"
                value={ytSearchQuery}
                onChange={(e) => setYtSearchQuery(e.target.value)}
                placeholder="Busca cualquier creador, streamer o tema en YouTube (ej: @RDjavi, Alofoke, Ibai, TheGrefg, GTA 6, MLB)..."
                className="w-full rounded-xl border border-slate-700 bg-[#1B1E25] pl-10 pr-4 py-2.5 text-sm text-[#F8FAFC] focus:border-[#FFD43B] focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={ytLoading}
              className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-6 py-2.5 text-sm font-extrabold text-white hover:bg-red-500 disabled:opacity-50"
            >
              {ytLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
              <span>Buscar en YouTube</span>
            </button>
          </form>

          {/* Viral Categories / Niches */}
          <div className="flex flex-wrap gap-2">
            {VIRAL_NICHES.map((vn) => (
              <button
                key={vn.id}
                type="button"
                onClick={() => loadTrendingRadar(vn.id)}
                className={`rounded-xl border px-3.5 py-2 text-xs font-extrabold transition ${
                  niche === vn.id
                    ? 'border-[#FFD43B] bg-[#FFD43B]/20 text-[#FFD43B]'
                    : 'border-slate-800 bg-[#1B1E25] text-slate-300 hover:border-slate-600 hover:text-white'
                }`}
              >
                {vn.label}
              </button>
            ))}
          </div>

          {/* AI Analysis Banner */}
          {aiSummaryEs && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-100">
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-[#FFD43B]" />
              <div>
                <div className="font-extrabold text-[#FFD43B]">
                  Diagnóstico de Viralidad IA (Claude 5.5 Haiku • $0.00 Créditos Grok):
                </div>
                <p className="mt-0.5 leading-relaxed">{aiSummaryEs}</p>
              </div>
            </div>
          )}

          {/* Embedded YouTube Player Preview Modal */}
          {previewVideo && (
            <div className="rounded-3xl border-2 border-[#FFD43B] bg-[#111318] p-5 shadow-2xl">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="rounded bg-red-600 px-2 py-0.5 text-[10px] font-black text-white">
                    REPRODUCTOR DE PREVISUALIZACIÓN YOUTUBE
                  </span>
                  <h3 className="mt-1 text-base font-extrabold text-white">{previewVideo.title}</h3>
                  <p className="text-xs text-slate-400">
                    {previewVideo.channelName} • {previewVideo.viewCountFormatted} • {previewVideo.durationFormatted}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={clippingVideoId === previewVideo.videoId}
                    onClick={() => handleClipYouTubeVideoNow(previewVideo)}
                    className="flex items-center gap-1.5 rounded-xl bg-[#FFD43B] px-4 py-2 text-xs font-black text-[#111318] hover:bg-amber-400"
                  >
                    <Scissors className="h-4 w-4" />
                    <span>
                      {clippingVideoId === previewVideo.videoId
                        ? 'Enviando a Clipear...'
                        : '⚡ Clipear Este Video Ahora'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewVideo(null)}
                    className="rounded-xl border border-slate-700 bg-slate-800 p-2 text-slate-300 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="aspect-video w-full max-h-[420px] overflow-hidden rounded-2xl border border-slate-800 bg-black">
                <iframe
                  src={`https://www.youtube.com/embed/${previewVideo.videoId}?autoplay=1&rel=0`}
                  title={previewVideo.title}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </div>
          )}

          {/* Viral Videos Grid */}
          {ytLoading ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-[#1B1E25] p-12 text-sm font-bold text-slate-300">
              <Loader2 className="h-5 w-5 animate-spin text-[#FFD43B]" />
              <span>Analizando YouTube en tiempo real y puntuando potencial viral...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ytVideos.map((yt) => (
                <div
                  key={yt.videoId}
                  className="flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-800 bg-[#1B1E25] shadow-xl transition hover:border-[#FFD43B]"
                >
                  <div>
                    <div className="relative aspect-video w-full overflow-hidden bg-black">
                      <img
                        src={yt.thumbnailUrl}
                        alt={yt.title}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                      <span className="absolute left-2.5 top-2.5 rounded-lg bg-black/85 px-2.5 py-1 text-[11px] font-black text-[#FFD43B] backdrop-blur">
                        {yt.viralBadgeText || `🔥 ${yt.viralScore}% VIRAL`}
                      </span>
                      <span
                        className={`absolute bottom-2.5 right-2.5 rounded px-2 py-0.5 text-[11px] font-bold text-white ${
                          yt.isLive ? 'bg-red-600' : 'bg-black/85'
                        }`}
                      >
                        {yt.durationFormatted}
                      </span>
                    </div>

                    <div className="p-4">
                      <div className="flex items-center justify-between text-xs font-bold text-emerald-400">
                        <span className="truncate">{yt.channelName}</span>
                        <span className="text-slate-400">{yt.viewCountFormatted}</span>
                      </div>
                      <h3 className="mt-1.5 line-clamp-2 text-sm font-extrabold text-white">{yt.title}</h3>
                      <p className="mt-1.5 text-[11px] text-slate-400">{yt.viralReasonEs}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 border-t border-slate-800 bg-[#13161C] p-3">
                    <button
                      type="button"
                      onClick={() => setPreviewVideo(yt)}
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-[#1B1E25] py-2 text-xs font-bold text-slate-200 hover:border-white hover:text-white"
                    >
                      <Eye className="h-3.5 w-3.5" /> Previsualizar
                    </button>
                    <button
                      type="button"
                      disabled={clippingVideoId === yt.videoId}
                      onClick={() => handleClipYouTubeVideoNow(yt)}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-[#FFD43B] py-2 text-xs font-black text-[#111318] hover:bg-amber-400 disabled:opacity-50"
                    >
                      <Scissors className="h-3.5 w-3.5" />
                      <span>{clippingVideoId === yt.videoId ? 'Clipeando...' : 'Clipear Directo'}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runSearch(query);
            }}
            className="flex gap-3"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-3 h-4 w-4 text-[#94A3B8]" />
              <input
                type="text"
                value={query}
                data-testid="find-moments-input"
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Escribe en lenguaje natural el momento exacto que buscas en tu biblioteca..."
                className="w-full rounded-xl border border-slate-700 bg-[#1B1E25] pl-10 pr-4 py-2.5 text-sm text-[#F8FAFC] focus:border-[#FFD43B] focus:outline-none"
              />
            </div>
            <button
              type="submit"
              data-testid="find-moments-submit"
              className="flex items-center gap-2 rounded-xl bg-[#FFD43B] px-6 py-2.5 text-sm font-bold text-[#111318] hover:bg-[#FFB703]"
            >
              <Sparkles className="h-4 w-4" /> Buscar Momentos
            </button>
          </form>

          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUERIES.map((sq) => (
              <button
                key={sq}
                type="button"
                onClick={() => runSearch(sq)}
                className="rounded-full border border-slate-800 bg-[#1B1E25] px-3.5 py-1.5 text-xs text-[#94A3B8] hover:border-[#FFD43B] hover:text-[#F8FAFC]"
              >
                "{sq}"
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {loading ? (
              <div className="rounded-2xl border border-slate-800 bg-[#1B1E25] p-8 text-center text-sm text-[#94A3B8]">
                Consultando índice vectorial pgvector...
              </div>
            ) : results.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-800 bg-[#1B1E25] p-8 text-center text-xs text-[#94A3B8]">
                Selecciona una de las consultas sugeridas o escribe tu búsqueda para localizar timestamps exactos.
              </div>
            ) : (
              results.map((item) => (
                <div
                  key={`${item.matchType}-${item.id}`}
                  data-testid="find-moment-result"
                  className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-[#1B1E25] p-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-[#FFD43B]/20 px-2 py-0.5 text-[11px] font-bold text-[#FFD43B]">
                        {item.matchType === 'SEMANTIC_TRANSCRIPT' ? 'Índice Semántico Voz' : 'Índice Visual Escena'}
                      </span>
                      <span className="flex items-center gap-1 text-xs font-semibold text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Confianza: {Math.round(item.confidence * 100)}%
                      </span>
                      <span className="flex items-center gap-1 text-xs text-[#94A3B8]">
                        <Clock className="h-3.5 w-3.5" /> {item.timestampSec}s - {item.endSec}s
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-[#F8FAFC]">{item.description}</div>
                    <div className="text-xs text-[#94A3B8]">Video origen: {item.videoTitle}</div>
                  </div>

                  <button
                    type="button"
                    disabled={creatingClipFor === item.id}
                    onClick={() => handleCreateClipFromMoment(item)}
                    className="flex items-center gap-1.5 rounded-xl bg-[#FFD43B] px-4 py-2 text-xs font-bold text-[#111318] hover:bg-[#FFB703]"
                  >
                    <Scissors className="h-3.5 w-3.5" />
                    {creatingClipFor === item.id ? 'Generando Clip...' : 'Crear Clip de este Momento'}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
