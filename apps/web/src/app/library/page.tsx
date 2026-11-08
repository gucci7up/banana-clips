'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/store';
import { FolderKanban, Film, Scissors, Layers, Download, Edit3, Search, HardDrive, Trash2, Star } from 'lucide-react';

type LibraryTab = 'ALL' | 'VIDEOS' | 'CLIPS' | 'MONTAGES' | 'FAVORITES' | 'TRASH';

export default function MediaLibraryPage() {
  const [tab, setTab] = useState<LibraryTab>('ALL');
  const [videos, setVideos] = useState<any[]>([]);
  const [clips, setClips] = useState<any[]>([]);
  const [montages, setMontages] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [minScore, setMinScore] = useState<number>(0);
  const [notice, setNotice] = useState<string>('');
  const [grokPreviewUrl, setGrokPreviewUrl] = useState<string | null>(null);
  const [grokBusyClipId, setGrokBusyClipId] = useState<string | null>(null);

  const handleGrokThumbnail = async (clipId: string) => {
    setGrokBusyClipId(clipId);
    setNotice('🎨 Generando Portada Viral 100% IA con Grok Imagine (xAI)... espera ~7 segundos...');
    try {
      const res = await apiFetch<{
        ok: boolean;
        headlineUsed: string;
        thumbnailUrl: string;
        downloadUrl: string;
      }>(`/clips/${clipId}/grok-thumbnail`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setGrokPreviewUrl(res.thumbnailUrl);
      setNotice(`✅ ¡Portada IA creada con Grok Imagine! Titular: "${res.headlineUsed}" — Descargando...`);
      window.open(res.downloadUrl, '_blank');
    } catch (err: any) {
      setNotice(`⚠️ ${err?.message || 'Error al generar miniatura con Grok Imagine'}`);
    } finally {
      setGrokBusyClipId(null);
    }
  };

  const handleDubClip = async (clipId: string) => {
    setNotice('🗣️ Aplicando Doblaje Neuronal IA al Español con Audio Ducking...');
    try {
      const res = await apiFetch<{ message: string }>(`/clips/${clipId}/dub`, {
        method: 'POST',
        body: JSON.stringify({ targetLang: 'ES_LATAM' }),
      });
      setNotice(res.message || '✅ Clip doblado al español.');
    } catch (err: any) {
      setNotice(`⚠️ ${err?.message || 'Error al doblar clip'}`);
    }
  };

  const handleColdOpenClip = async (clipId: string) => {
    setGrokBusyClipId(clipId);
    setNotice('⚡ Claude 5.5 analizando clímax y adelantando los 2.5s más explosivos al inicio (Cold Open)...');
    try {
      const res = await apiFetch<{ message: string }>(`/clips/${clipId}/cold-open`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setNotice(res.message || '✅ Cold Open aplicado con Claude 5.5.');
    } catch (err: any) {
      setNotice(`⚠️ ${err?.message || 'Error al aplicar Cold Open con Claude 5.5'}`);
    } finally {
      setGrokBusyClipId(null);
    }
  };

  const handleTelegramClip = async (clipId: string) => {
    setNotice('📱 Enviando video MP4 + Copy Viral a tu Bot de Telegram...');
    try {
      const res = await apiFetch<{ message: string }>('/social/telegram-send', {
        method: 'POST',
        body: JSON.stringify({ clipId }),
      });
      setNotice(res.message || '✅ Enviado a Telegram.');
    } catch (err: any) {
      setNotice(`⚠️ ${err?.message || 'Configura tu Bot Token en Publicación Social → Automatizaciones'}`);
    }
  };

  const handleToggleFavorite = async (clipId: string) => {
    try {
      const res = await apiFetch<{ id: string; isFavorite: boolean }>(`/clips/${clipId}/favorite`, {
        method: 'PATCH',
        body: JSON.stringify({}),
      });
      setClips((prev) => prev.map((c) => (c.id === clipId ? { ...c, isFavorite: res.isFavorite } : c)));
    } catch {}
  };

  const handleDeleteClip = async (clipId: string, title?: string) => {
    if (!window.confirm(`¿Eliminar permanentemente "${title || 'este clip'}" y liberar espacio en el servidor?`)) {
      return;
    }
    setNotice('🗑️ Eliminando clip y liberando espacio en disco...');
    try {
      const res = await apiFetch<{ deleted: boolean; message: string }>(`/clips/${clipId}`, {
        method: 'DELETE',
      });
      setClips((prev) => prev.filter((c) => c.id !== clipId));
      setMontages((prev) => prev.filter((m) => m.name !== title));
      setNotice(res.message || '🗑️ Clip eliminado permanentemente.');
    } catch (err: any) {
      setNotice(`⚠️ ${err?.message || 'Error al eliminar el clip'}`);
    }
  };

  const handleDeleteMontage = async (montageId: string, name?: string) => {
    if (!window.confirm(`¿Eliminar permanentemente la historia "${name || 'seleccionada'}" y su archivo MP4 del disco?`)) {
      return;
    }
    setNotice('🗑️ Eliminando historia y liberando espacio en disco...');
    try {
      const res = await apiFetch<{ deleted: boolean; message: string }>(`/montages/${montageId}`, {
        method: 'DELETE',
      });
      setMontages((prev) => prev.filter((m) => m.id !== montageId));
      setClips((prev) => prev.filter((c) => c.title !== name));
      setNotice(res.message || '🗑️ Historia eliminada permanentemente.');
    } catch (err: any) {
      setNotice(`⚠️ ${err?.message || 'Error al eliminar la historia'}`);
    }
  };

  const handleDeleteVideo = async (videoId: string, title?: string) => {
    if (
      !window.confirm(
        `¿Eliminar permanentemente el video original "${title || 'seleccionado'}" y sus cortes asociados del disco?`
      )
    ) {
      return;
    }
    setNotice('🗑️ Eliminando video original y liberando espacio en disco...');
    try {
      const res = await apiFetch<{ deleted: boolean; message: string }>(`/videos/${videoId}`, {
        method: 'DELETE',
      });
      setVideos((prev) => prev.filter((v) => v.id !== videoId));
      setClips((prev) => prev.filter((c) => c.videoId !== videoId));
      setNotice(res.message || '🗑️ Video original eliminado permanentemente.');
    } catch (err: any) {
      setNotice(`⚠️ ${err?.message || 'Error al eliminar el video'}`);
    }
  };

  useEffect(() => {
    Promise.all([
      apiFetch<{ videos: any[] }>('/videos'),
      apiFetch<{ clips: any[] }>('/clips'),
      apiFetch<{ montages: any[] }>('/montages'),
    ]).then(([v, c, m]) => {
      setVideos(v.videos || []);
      setClips(c.clips || []);
      setMontages(m.montages || []);
    });
  }, []);

  const filteredClips = clips.filter(
    (c) =>
      (c.title || '').toLowerCase().includes(searchTerm.toLowerCase()) &&
      (c.scoreTotal ?? 80) >= minScore &&
      (tab === 'FAVORITES' ? Boolean(c.isFavorite) : true)
  );

  const filteredMontages = montages.filter((m) =>
    (m.name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredVideos = videos.filter((v) =>
    (v.title || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-0.5 text-[11px] font-extrabold text-emerald-400 border border-emerald-500/30">
              <HardDrive className="h-3.5 w-3.5" /> Volumen Persistente Activo — No se borra al hacer Redeploy
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-extrabold text-[#F8FAFC]">Mi Biblioteca Multimedia (Galería)</h1>
          <p className="text-xs text-[#94A3B8]">
            Todos tus clips de IA, cortes en vivo de YouTube, historias Stickman de 60s y videos originales guardados en disco persistente
          </p>
        </div>

        <div className="flex w-full sm:w-auto flex-wrap items-center gap-2.5">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#94A3B8]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filtrar por título..."
              className="w-full sm:w-56 rounded-xl border border-slate-700 bg-[#131720] pl-9 pr-3 py-2 text-xs text-white focus:border-[#FFD43B] focus:outline-none"
            />
          </div>
          <select
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            className="rounded-xl border border-slate-700 bg-[#131720] px-3 py-2 text-xs text-white"
          >
            <option value={0}>Score: Todos (0+)</option>
            <option value={70}>Score: 70+ Alta Calidad</option>
            <option value={80}>Score: 80+ Destacados</option>
          </select>
        </div>
      </div>

      {/* Views Tabs */}
      <div className="flex overflow-x-auto pb-1 gap-2 no-scrollbar">
        {[
          { id: 'ALL', label: `Todos (${clips.length + montages.length + videos.length})` },
          { id: 'CLIPS', label: `Clips & Live (${clips.length})` },
          { id: 'MONTAGES', label: `Historias 60s (${montages.length})` },
          { id: 'VIDEOS', label: `Originales (${videos.length})` },
          { id: 'FAVORITES', label: 'Favoritos' },
          { id: 'TRASH', label: 'Papelera' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as LibraryTab)}
            className={`shrink-0 rounded-xl px-4 py-2 text-xs font-bold transition ${
              tab === t.id
                ? 'bg-gradient-to-r from-[#FFD43B] to-[#FFB703] text-[#0B0D12] shadow'
                : 'border border-slate-800 bg-[#131720] text-[#94A3B8] hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {notice && (
        <div className="rounded-xl border border-[#FFD43B]/40 bg-[#FFD43B]/10 px-4 py-2.5 text-xs font-bold text-[#FFD43B]">
          {notice}
        </div>
      )}

      {grokPreviewUrl && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-purple-500/40 bg-purple-500/10 p-4">
          <div className="flex items-center gap-4">
            <img
              src={grokPreviewUrl}
              alt="Portada IA Grok Imagine"
              className="h-36 w-20 rounded-xl border border-purple-400/40 object-cover shadow-lg"
            />
            <div>
              <div className="text-xs font-extrabold text-purple-300">
                🎨 Nueva Portada Viral Generada por Grok Imagine (xAI)
              </div>
              <p className="mt-1 text-[11px] text-slate-300">
                La miniatura 9:16 ya quedó guardada como portada oficial de tu clip y lista para subir a Shorts/TikTok/Reels.
              </p>
              <div className="mt-2 flex gap-2">
                <a
                  href={`${grokPreviewUrl}&download=1`}
                  className="rounded-lg bg-purple-500 px-3 py-1.5 text-[11px] font-black text-white hover:bg-purple-400"
                >
                  ⬇️ Descargar JPG 9:16
                </a>
                <button
                  type="button"
                  onClick={() => setGrokPreviewUrl(null)}
                  className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-[11px] font-bold text-slate-300"
                >
                  Cerrar Vista Previa
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clips Section */}
      {(tab === 'ALL' || tab === 'CLIPS' || tab === 'FAVORITES') && (
        <div className="space-y-3">
          <h2 className="text-base font-bold text-[#FFD43B]">
            {tab === 'FAVORITES'
              ? `Mis Clips Favoritos (${filteredClips.length})`
              : `Clips Generados, Cortes en Vivo e Historias (${filteredClips.length})`}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredClips.map((c) => (
              <div
                key={c.id}
                data-testid="library-clip-item"
                className="studio-card studio-card-hover flex flex-col justify-between p-4"
              >
                <div>
                  {c.signedDownloadUrl && (
                    <video
                      src={c.signedDownloadUrl}
                      controls
                      preload="metadata"
                      className="mb-3 h-48 w-full rounded-xl bg-black object-contain"
                    />
                  )}
                  <div className="flex items-center justify-between text-xs">
                    <span className="rounded bg-[#FFD43B] px-2 py-0.5 font-black text-[#111318]">
                      Score {c.scoreTotal ?? 85}/100
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[#94A3B8]">
                        {c.category || 'CLIP'} • {c.durationSec}s • {c.aspectRatio}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleToggleFavorite(c.id)}
                        title="Marcar como Favorito"
                        className={`rounded-lg p-1 transition ${
                          c.isFavorite ? 'text-[#FFD43B]' : 'text-slate-500 hover:text-[#FFD43B]'
                        }`}
                      >
                        <Star className="h-3.5 w-3.5 fill-current" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 font-bold text-sm text-white">{c.title}</div>
                  <p className="mt-1 text-xs text-[#94A3B8] line-clamp-2">{c.explanation || c.summary}</p>
                </div>

                <div className="mt-4 space-y-2 border-t border-slate-800 pt-3 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <a
                      href={`/api/v1/clips/${c.id}/thumbnail?download=1&regenerate=1`}
                      className="rounded-lg border border-slate-700 bg-slate-900/80 px-2.5 py-1 text-[11px] font-bold text-slate-200 hover:border-[#FFD43B] hover:text-[#FFD43B]"
                      title="Fotograma real del video + Titular automático ($0.00 créditos)"
                    >
                      🖼️ Portada Frame
                    </a>
                    <button
                      type="button"
                      disabled={grokBusyClipId === c.id}
                      onClick={() => handleGrokThumbnail(c.id)}
                      className="rounded-lg border border-purple-500/40 bg-purple-500/15 px-2.5 py-1 text-[11px] font-bold text-purple-300 hover:bg-purple-500/25 disabled:opacity-40"
                      title="Generar Portada 100% IA con Grok Imagine ($0.02)"
                    >
                      {grokBusyClipId === c.id ? '⏳ IA...' : '🎨 Portada IA (Grok)'}
                    </button>
                    <button
                      type="button"
                      disabled={grokBusyClipId === c.id}
                      onClick={() => handleColdOpenClip(c.id)}
                      className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold text-amber-300 hover:bg-amber-500/25 disabled:opacity-40"
                      title="Adelantar los 2.5s más explosivos al segundo 00:00 con Claude 5.5"
                    >
                      ⚡ Cold Open (Claude)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDubClip(c.id)}
                      className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/25"
                    >
                      🗣️ Doblar ES
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTelegramClip(c.id)}
                      className="rounded-lg border border-sky-500/40 bg-sky-500/15 px-2.5 py-1 text-[11px] font-bold text-sky-300 hover:bg-sky-500/25"
                    >
                      📱 Telegram
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/editor?clipId=${c.id}`}
                        className="flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 font-semibold text-white hover:border-[#FFD43B]"
                      >
                        <Edit3 className="h-3.5 w-3.5" /> Editar
                      </Link>
                      <a
                        href={`/api/v1/clips/${c.id}/xml`}
                        download={`${c.title}.xml`}
                        className="flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1.5 font-semibold text-[#FFD43B] hover:border-[#FFD43B]"
                      >
                        <Download className="h-3.5 w-3.5" /> XML
                      </a>
                      <button
                        type="button"
                        onClick={() => handleDeleteClip(c.id, c.title)}
                        className="flex items-center gap-1 rounded-lg border border-red-500/40 bg-red-500/15 px-2.5 py-1.5 font-bold text-red-400 hover:bg-red-500/30"
                        title="Eliminar clip permanentemente y liberar espacio en disco"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Eliminar
                      </button>
                    </div>
                    {c.signedDownloadUrl && (
                      <a
                        href={c.signedDownloadUrl}
                        download={`${c.title}.mp4`}
                        className="flex items-center gap-1 rounded-lg bg-[#FFD43B] px-3 py-1.5 font-bold text-[#111318]"
                      >
                        <Download className="h-3.5 w-3.5" /> Descargar MP4
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Montages & 60s Stories Section */}
      {(tab === 'ALL' || tab === 'MONTAGES') && filteredMontages.length > 0 && (
        <div className="space-y-3 pt-4">
          <h2 className="text-base font-bold text-emerald-400">
            Historias Stickman 60s y Montajes ({filteredMontages.length})
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {filteredMontages.map((m) => (
              <div
                key={m.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-[#1B1E25] p-4 space-y-3"
              >
                <div>
                  {m.signedDownloadUrl && (
                    <video
                      src={m.signedDownloadUrl}
                      controls
                      preload="metadata"
                      className="mb-3 h-48 w-full rounded-xl bg-black object-contain"
                    />
                  )}
                  <div className="font-bold text-sm text-white">{m.name}</div>
                  <div className="text-xs text-[#94A3B8]">
                    {m.templateName} • {m.titleOverlay || m.aspectRatio}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {m.signedDownloadUrl && (
                    <a
                      href={m.signedDownloadUrl}
                      download={`${m.name}.mp4`}
                      className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-[#FFD43B] px-3 py-2 text-xs font-black text-[#111318]"
                    >
                      <Download className="h-3.5 w-3.5" /> Descargar MP4
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDeleteMontage(m.id, m.name)}
                    className="flex items-center justify-center gap-1 rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-2 text-xs font-bold text-red-400 hover:bg-red-500/30"
                    title="Eliminar historia permanentemente del disco"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Original Videos Section */}
      {(tab === 'ALL' || tab === 'VIDEOS') && (
        <div className="space-y-3 pt-4">
          <h2 className="text-base font-bold text-[#F8FAFC]">Videos Originales ({filteredVideos.length})</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {filteredVideos.map((v) => (
              <div key={v.id} className="rounded-2xl border border-slate-800 bg-[#1B1E25] p-4 text-xs space-y-2">
                {v.signedStreamUrl && (
                  <video
                    src={v.signedStreamUrl}
                    controls
                    preload="metadata"
                    className="mb-2 h-40 w-full rounded-xl bg-black object-contain"
                  />
                )}
                <div className="font-bold text-sm text-[#F8FAFC]">{v.title}</div>
                <div className="text-[#94A3B8]">
                  Archivo: {v.originalFilename} • Duración: {v.durationSeconds ?? 24}s • {v.width ?? 1280}x{v.height ?? 720}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  {v.signedStreamUrl && (
                    <a
                      href={v.signedStreamUrl}
                      download={v.originalFilename}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 font-semibold text-[#FFD43B] hover:border-[#FFD43B]"
                    >
                      <Download className="h-3.5 w-3.5" /> Descargar Original
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDeleteVideo(v.id, v.title)}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-1.5 font-bold text-red-400 hover:bg-red-500/30"
                    title="Eliminar video original y sus archivos del disco"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Eliminar Video
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
