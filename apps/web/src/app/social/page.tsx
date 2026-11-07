'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/store';
import { Share2, CheckCircle2, Calendar } from 'lucide-react';

export default function SocialPublishingPage() {
  const [data, setData] = useState<any>({ accounts: [], posts: [] });
  const [platform, setPlatform] = useState('TikTok');
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const loadSocial = async () => {
    const res = await apiFetch('/social');
    setData(res);
  };

  useEffect(() => {
    loadSocial();
  }, []);

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch<{ notice: string }>('/social/posts', {
      method: 'POST',
      body: JSON.stringify({
        platform,
        title,
        caption,
        hashtags: ['#shorts', '#reels', '#tiktok'],
      }),
    });
    setNotice(res.notice);
    setTitle('');
    setCaption('');
    await loadSocial();
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-800 pb-4">
        <h1 className="text-2xl font-extrabold text-[#F8FAFC]">Publicaciones en Redes Sociales</h1>
        <p className="text-xs text-[#94A3B8]">
          Gestión modular de cuentas conectadas (OAuth cifrado AES-256-GCM) y paquetes de exportación manual verificada para TikTok, YouTube, Instagram y Facebook
        </p>
      </div>

      {notice && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <form onSubmit={handleCreatePost} className="space-y-4 rounded-2xl border border-slate-800 bg-[#1B1E25] p-5">
          <h2 className="text-base font-bold text-[#FFD43B]">Preparar Publicación / Exportación</h2>
          <div>
            <label className="block text-xs font-semibold text-[#94A3B8]">Plataforma Destino</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-[#111318] p-2.5 text-xs"
            >
              <option value="TikTok">TikTok</option>
              <option value="YouTube">YouTube Shorts</option>
              <option value="Instagram">Instagram Reels</option>
              <option value="Facebook">Facebook Reels</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#94A3B8]">Título</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-[#111318] p-2.5 text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#94A3B8]">Descripción y Hashtags</label>
            <textarea
              required
              rows={3}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-[#111318] p-2.5 text-xs"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-xl bg-[#FFD43B] py-2.5 text-xs font-bold text-[#111318]"
          >
            Guardar Publicación
          </button>
        </form>

        <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-[#1B1E25] p-5">
          <h2 className="mb-3 text-base font-bold">Historial de Publicaciones y Borradores</h2>
          <div className="space-y-2.5">
            {(data.posts || []).map((p: any) => (
              <div key={p.id} className="flex items-center justify-between rounded-xl border border-slate-800 bg-[#111318] p-3.5 text-xs">
                <div>
                  <div className="font-bold text-sm">{p.title} ({p.platform})</div>
                  <div className="text-[#94A3B8]">{p.caption}</div>
                </div>
                <span className="rounded bg-[#FFD43B]/20 px-2.5 py-1 font-bold text-[#FFD43B]">
                  {p.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
