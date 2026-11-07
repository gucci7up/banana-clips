'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/store';
import { FolderKanban, Film, Scissors, Layers, Download, Edit3, Search } from 'lucide-react';

type LibraryTab = 'ALL' | 'VIDEOS' | 'CLIPS' | 'MONTAGES' | 'FAVORITES' | 'TRASH';

export default function MediaLibraryPage() {
  const [tab, setTab] = useState<LibraryTab>('ALL');
  const [videos, setVideos] = useState<any[]>([]);
  const [clips, setClips] = useState<any[]>([]);
  const [montages, setMontages] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [minScore, setMinScore] = useState<number>(0);

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
      c.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
      (c.scoreTotal ?? 80) >= minScore
  );

  const filteredVideos = videos.filter((v) =>
    v.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#F8FAFC]">Mi Biblioteca Multimedia</h1>
          <p className="text-xs text-[#94A3B8]">
            Aislamiento privado por usuario con enlaces firmados (HMAC-SHA256) y filtros por calidad, puntuación y formato
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#94A3B8]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filtrar por título..."
              className="rounded-xl border border-slate-700 bg-[#1B1E25] pl-9 pr-3 py-2 text-xs"
            />
          </div>
          <select
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            className="rounded-xl border border-slate-700 bg-[#1B1E25] px-3 py-2 text-xs"
          >
            <option value={0}>Score: Todos (0+)</option>
            <option value={70}>Score: 70+ Alta Calidad</option>
            <option value={80}>Score: 80+ Destacados</option>
          </select>
        </div>
      </div>

      {/* Views Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'ALL', label: 'Todos los archivos' },
          { id: 'VIDEOS', label: `Videos Originales (${videos.length})` },
          { id: 'CLIPS', label: `Clips Generados (${clips.length})` },
          { id: 'MONTAGES', label: `Montajes (${montages.length})` },
          { id: 'FAVORITES', label: 'Favoritos' },
          { id: 'TRASH', label: 'Papelera' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as LibraryTab)}
            className={`rounded-xl px-4 py-2 text-xs font-bold ${
              tab === t.id ? 'bg-[#FFD43B] text-[#111318]' : 'bg-[#1B1E25] text-[#94A3B8]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Clips Section */}
      {(tab === 'ALL' || tab === 'CLIPS') && (
        <div className="space-y-3">
          <h2 className="text-base font-bold text-[#FFD43B]">Clips Generados ({filteredClips.length})</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {filteredClips.map((c) => (
              <div
                key={c.id}
                data-testid="library-clip-item"
                className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-[#1B1E25] p-4"
              >
                <div>
                  {c.signedDownloadUrl && (
                    <video
                      src={c.signedDownloadUrl}
                      controls
                      preload="metadata"
                      className="mb-3 h-40 w-full rounded-xl bg-black object-contain"
                    />
                  )}
                  <div className="flex items-center justify-between text-xs">
                    <span className="rounded bg-[#FFD43B] px-2 py-0.5 font-black text-[#111318]">
                      Score {c.scoreTotal ?? 85}/100
                    </span>
                    <span className="text-[#94A3B8]">
                      {c.durationSec}s • {c.aspectRatio}
                    </span>
                  </div>
                  <div className="mt-2 font-bold text-sm">{c.title}</div>
                  <p className="mt-1 text-xs text-[#94A3B8] line-clamp-2">{c.explanation}</p>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3 text-xs">
                  <Link
                    href={`/editor?clipId=${c.id}`}
                    className="flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 font-semibold hover:border-[#FFD43B]"
                  >
                    <Edit3 className="h-3.5 w-3.5" /> Editar
                  </Link>
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
                <div className="font-bold text-sm text-[#F8FAFC]">{v.title}</div>
                <div className="text-[#94A3B8]">
                  Archivo: {v.originalFilename} • Duración: {v.durationSeconds}s • {v.width}x{v.height} ({v.videoCodec})
                </div>
                {v.signedStreamUrl && (
                  <a
                    href={v.signedStreamUrl}
                    download={v.originalFilename}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 font-semibold text-[#FFD43B]"
                  >
                    <Download className="h-3.5 w-3.5" /> Descargar Original
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
