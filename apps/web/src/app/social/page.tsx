'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/store';
import {
  Share2,
  Calendar,
  Sparkles,
  Clock,
  Hash,
  Webhook,
  Download,
  Zap,
  CheckCircle2,
  Copy,
  Film,
  Send,
  Globe,
  Loader2,
} from 'lucide-react';

type SocialViewTab = 'COMPOSER' | 'CALENDAR' | 'AUTOMATIONS';

export default function SocialPublishingPage() {
  const [activeTab, setActiveTab] = useState<SocialViewTab>('COMPOSER');
  const [data, setData] = useState<any>({ accounts: [], posts: [] });
  const [clips, setClips] = useState<any[]>([]);

  // Composer + AI Copywriter (Ocoya Travis AI style)
  const [selectedClipId, setSelectedClipId] = useState<string>('');
  const [platform, setPlatform] = useState('TikTok');
  const [tone, setTone] = useState('VIRAL');
  const [language, setLanguage] = useState('es');
  const [customTopic, setCustomTopic] = useState('');
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState<string[]>(['#viral', '#shorts', '#fyp', '#parati']);
  const [xThread, setXThread] = useState<string[]>([]);
  const [aiEngineUsed, setAiEngineUsed] = useState('Grok 4.20 (xAI)');
  const [bestTimeRec, setBestTimeRec] = useState('19:30 (Pico Viral +46%)');
  const [scheduledAt, setScheduledAt] = useState('');

  const [generatingAi, setGeneratingAi] = useState(false);
  const [generatingGrokThumb, setGeneratingGrokThumb] = useState(false);
  const [grokThumbUrl, setGrokThumbUrl] = useState<string | null>(null);
  const [autoScheduling, setAutoScheduling] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [sendingWebhook, setSendingWebhook] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Feature 5: Telegram Bot Direct Push
  const [tgBotToken, setTgBotToken] = useState('');
  const [tgChatId, setTgChatId] = useState('');
  const [tgAutoSendLive, setTgAutoSendLive] = useState(true);
  const [savingTg, setSavingTg] = useState(false);
  const [sendingTg, setSendingTg] = useState(false);

  // Feature 6: 24/7 Auto-Channel Watcher
  const [watchedChannels, setWatchedChannels] = useState<any[]>([]);
  const [newChannelUrl, setNewChannelUrl] = useState('https://www.youtube.com/@FoxNews/streams');
  const [newChannelName, setNewChannelName] = useState('Fox News Live');
  const [newChannelSplitMode, setNewChannelSplitMode] = useState('NONE');
  const [newChannelDubLang, setNewChannelDubLang] = useState('NONE');
  const [scanningWatcher, setScanningWatcher] = useState(false);

  const loadAll = async () => {
    const [socRes, clipRes, tgRes, chRes] = await Promise.all([
      apiFetch('/social'),
      apiFetch<{ clips: any[] }>('/clips'),
      apiFetch<{ config: any }>('/social/telegram-config').catch(() => ({ config: null })),
      apiFetch<{ channels: any[] }>('/channel-watcher').catch(() => ({ channels: [] })),
    ]);
    setData(socRes || { accounts: [], posts: [] });
    const clipList = clipRes?.clips || [];
    setClips(clipList);
    if (!selectedClipId && clipList.length > 0) {
      setSelectedClipId(clipList[0].id);
    }
    if (tgRes?.config) {
      setTgBotToken(tgRes.config.botToken || '');
      setTgChatId(tgRes.config.chatId || '');
      setTgAutoSendLive(tgRes.config.autoSendLiveClips !== false);
    }
    setWatchedChannels(chRes?.channels || []);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const selectedClipObj = clips.find((c) => c.id === selectedClipId) || null;

  const handleGenerateGrokThumb = async () => {
    if (!selectedClipId) return;
    setGeneratingGrokThumb(true);
    setNotice('🎨 Generando Portada 100% IA con Grok Imagine (xAI)... espera ~7s...');
    try {
      const res = await apiFetch<{
        ok: boolean;
        headlineUsed: string;
        thumbnailUrl: string;
        downloadUrl: string;
      }>(`/clips/${selectedClipId}/grok-thumbnail`, {
        method: 'POST',
        body: JSON.stringify({ headline: title || undefined, customPrompt: customTopic || undefined }),
      });
      setGrokThumbUrl(res.thumbnailUrl);
      setNotice(`✅ Portada IA generada por Grok Imagine: "${res.headlineUsed}"`);
    } catch (err: any) {
      setNotice(`⚠️ ${err?.message || 'Error al generar miniatura con Grok Imagine'}`);
    } finally {
      setGeneratingGrokThumb(false);
    }
  };

  const handleGenerateAiCopy = async () => {
    setGeneratingAi(true);
    setNotice(null);
    try {
      const res = await apiFetch<{
        title: string;
        caption: string;
        hashtags: string[];
        xThread?: string[];
        aiEngineUsed?: string;
        bestTimeRecommendation: string;
      }>('/social/ai-copywriter', {
        method: 'POST',
        body: JSON.stringify({
          clipId: selectedClipId || undefined,
          topic: customTopic,
          platform,
          tone,
          language,
        }),
      });
      setTitle(res.title);
      setCaption(res.caption);
      setHashtags(res.hashtags || []);
      setXThread(res.xThread || []);
      if (res.aiEngineUsed) setAiEngineUsed(res.aiEngineUsed);
      setBestTimeRec(res.bestTimeRecommendation || '19:30 (Pico Viral +45%)');
    } catch (err: any) {
      setNotice(err.message || 'Error al generar copy con IA');
    } finally {
      setGeneratingAi(false);
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch<{ notice: string }>('/social/posts', {
      method: 'POST',
      body: JSON.stringify({
        clipId: selectedClipId || null,
        platform,
        title,
        caption,
        hashtags,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      }),
    });
    setNotice(res.notice);
    setTitle('');
    setCaption('');
    await loadAll();
  };

  const handleAutoScheduleWeek = async () => {
    setAutoScheduling(true);
    try {
      const res = await apiFetch<{ notice: string }>('/social/auto-schedule', {
        method: 'POST',
        body: JSON.stringify({ platforms: ['TikTok', 'YouTube', 'Instagram', 'X'] }),
      });
      setNotice(res.notice);
      await loadAll();
      setActiveTab('CALENDAR');
    } finally {
      setAutoScheduling(false);
    }
  };

  const handleExportCsv = () => {
    const rows = [
      ['ID', 'Platform', 'Title', 'Caption', 'Hashtags', 'Status', 'ScheduledAt', 'MP4_URL'],
      ...(data.posts || []).map((p: any) => [
        p.id,
        p.platform,
        `"${String(p.title || '').replace(/"/g, '""')}"`,
        `"${String(p.caption || '').replace(/"/g, '""')}"`,
        `"${(Array.isArray(p.hashtags) ? p.hashtags : []).join(' ')}"`,
        p.status,
        p.scheduledAt || p.createdAt,
        p.clipDownloadUrl ? `${window.location.origin}${p.clipDownloadUrl}` : '',
      ]),
    ];
    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `banana_clips_social_calendar_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePushWebhook = async () => {
    if (!webhookUrl.trim()) return;
    setSendingWebhook(true);
    try {
      const res = await apiFetch<{ message: string }>('/social/webhook-push', {
        method: 'POST',
        body: JSON.stringify({ webhookUrl: webhookUrl.trim() }),
      });
      setNotice(res.message);
    } catch (err: any) {
      setNotice(err.message || 'Error al enviar Webhook');
    } finally {
      setSendingWebhook(false);
    }
  };

  const handleSaveTelegramConfig = async () => {
    setSavingTg(true);
    try {
      const res = await apiFetch<{ message: string }>('/social/telegram-config', {
        method: 'POST',
        body: JSON.stringify({
          botToken: tgBotToken,
          chatId: tgChatId,
          autoSendLiveClips: tgAutoSendLive,
        }),
      });
      setNotice(res.message || '✅ Configuración de Bot de Telegram guardada.');
    } catch (err: any) {
      setNotice(err.message || 'Error al guardar Bot de Telegram');
    } finally {
      setSavingTg(false);
    }
  };

  const handleSendTelegramNow = async () => {
    setSendingTg(true);
    try {
      const res = await apiFetch<{ message: string }>('/social/telegram-send', {
        method: 'POST',
        body: JSON.stringify({
          clipId: selectedClipId || undefined,
          botToken: tgBotToken,
          chatId: tgChatId,
        }),
      });
      setNotice(res.message);
    } catch (err: any) {
      setNotice(err.message || 'Error al enviar clip a Telegram');
    } finally {
      setSendingTg(false);
    }
  };

  const handleAddWatchedChannel = async () => {
    if (!newChannelUrl.trim()) return;
    try {
      const res = await apiFetch<{ channels: any[] }>('/channel-watcher', {
        method: 'POST',
        body: JSON.stringify({
          channelUrl: newChannelUrl.trim(),
          channelName: newChannelName.trim() || 'Canal de YouTube',
          checkIntervalMin: 15,
          clipDurationSec: 20,
          splitScreenMode: newChannelSplitMode,
          voiceDubbingLang: newChannelDubLang,
        }),
      });
      setWatchedChannels(res.channels || []);
      setNotice('📡 Canal agregado al Vigilante Automático 24/7.');
    } catch (err: any) {
      setNotice(err.message || 'Error al agregar canal');
    }
  };

  const handleDeleteWatchedChannel = async (id: string) => {
    try {
      const res = await apiFetch<{ channels: any[] }>(`/channel-watcher/${id}`, {
        method: 'DELETE',
      });
      setWatchedChannels(res.channels || []);
    } catch {}
  };

  const handleScanChannelNow = async (channelId?: string) => {
    setScanningWatcher(true);
    try {
      const res = await apiFetch<{ message: string; channels: any[] }>('/channel-watcher/scan-now', {
        method: 'POST',
        body: JSON.stringify({ channelId }),
      });
      setWatchedChannels(res.channels || []);
      setNotice(res.message);
    } catch (err: any) {
      setNotice(err.message || 'Error al escanear canal');
    } finally {
      setScanningWatcher(false);
    }
  };

  // Build 7-day calendar columns starting today
  const next7Days = Array.from({ length: 7 }, (_, idx) => {
    const d = new Date();
    d.setDate(d.getDate() + idx);
    const isoDate = d.toISOString().slice(0, 10);
    const dayLabel = d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
    const dayPosts = (data.posts || []).filter((p: any) => {
      const targetDate = (p.scheduledAt || p.createdAt || '').slice(0, 10);
      return targetDate === isoDate;
    });
    return { isoDate, dayLabel, dayPosts };
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#FFD43B]/30 bg-[#FFD43B]/10 px-3 py-0.5 text-[11px] font-extrabold text-[#FFD43B]">
            <Sparkles className="h-3.5 w-3.5" /> AI Copywriter + Calendario Visual + Automatizaciones (Estilo Ocoya Pro)
          </div>
          <h1 className="mt-1.5 text-xl sm:text-2xl font-extrabold text-white">
            Social AI Studio & Calendario de Contenidos
          </h1>
          <p className="text-xs text-slate-400">
            Redacta copy viral en 28+ idiomas con IA, descubre la mejor hora para publicar, programa tu semana en 1 clic y conecta Webhooks (n8n / Make)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleAutoScheduleWeek}
            disabled={autoScheduling}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#FFD43B] to-[#FFB703] px-4 py-2 text-xs font-black text-[#0B0D12] shadow hover:brightness-105 disabled:opacity-50"
          >
            {autoScheduling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            Auto-Programar Mejores Clips (7 Días)
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-[#131720] px-3.5 py-2 text-xs font-bold text-slate-200 hover:border-[#FFD43B]"
          >
            <Download className="h-3.5 w-3.5 text-[#FFD43B]" /> Exportar CSV Bulk
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex overflow-x-auto gap-2 pb-1">
        {[
          { id: 'COMPOSER', label: '✨ 1. AI Copywriter & Creador de Posts', icon: Sparkles },
          { id: 'CALENDAR', label: `📅 2. Calendario Visual Semanal (${(data.posts || []).length})`, icon: Calendar },
          { id: 'AUTOMATIONS', label: '🤖 3. Automatizaciones, n8n Webhook & CSV', icon: Webhook },
        ].map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id as SocialViewTab)}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
                active
                  ? 'bg-[#FFD43B] text-[#0B0D12] shadow'
                  : 'border border-slate-800 bg-[#131720] text-slate-400 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {notice && (
        <div className="flex items-center justify-between rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3.5 text-xs font-semibold text-emerald-200">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            {notice}
          </span>
          <button type="button" onClick={() => setNotice(null)} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* TAB 1: AI COPYWRITER & COMPOSER */}
      {activeTab === 'COMPOSER' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left 5 cols: AI Copywriter Controls & Video Selector */}
          <div className="studio-card space-y-4 p-5 lg:col-span-5">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-extrabold text-[#FFD43B]">
                <Sparkles className="h-4 w-4" /> Asistente AI Copywriter ({aiEngineUsed})
              </h2>
              <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400">
                ⚡ Grok 4.20 + 28 Idiomas
              </span>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                <Film className="h-3.5 w-3.5 text-[#FFD43B]" /> Seleccionar Clip de tu Galería ({clips.length} disponibles)
              </label>
              <select
                value={selectedClipId}
                onChange={(e) => setSelectedClipId(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-[#0B0D12] p-2.5 text-xs font-bold text-white"
              >
                <option value="">-- Usar tema libre sin clip adjunto --</option>
                {clips.map((c) => (
                  <option key={c.id} value={c.id}>
                    [Score {c.scoreTotal ?? 90}] {c.title} ({c.durationSec}s)
                  </option>
                ))}
              </select>
            </div>

            {selectedClipObj?.signedDownloadUrl && (
              <div className="rounded-2xl border border-slate-800 bg-[#0B0D12] p-2.5 space-y-2.5">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <video
                    src={selectedClipObj.signedDownloadUrl}
                    controls
                    preload="metadata"
                    className="h-44 w-full rounded-xl bg-black object-contain"
                  />
                  <div className="flex flex-col items-center justify-center rounded-xl border border-purple-500/30 bg-purple-500/10 p-2.5 text-center">
                    {grokThumbUrl ? (
                      <img
                        src={grokThumbUrl}
                        alt="Portada IA Grok"
                        className="h-32 w-auto rounded-lg border border-purple-400/40 object-contain"
                      />
                    ) : (
                      <div className="text-[11px] font-bold text-purple-300">
                        🎨 Portada Viral 9:16 con Grok Imagine
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                      <button
                        type="button"
                        disabled={generatingGrokThumb}
                        onClick={handleGenerateGrokThumb}
                        className="rounded-lg bg-purple-500 px-2.5 py-1 text-[10px] font-black text-white hover:bg-purple-400 disabled:opacity-50"
                      >
                        {generatingGrokThumb ? '⏳ Creando con Grok...' : '🎨 Crear Portada IA (Grok)'}
                      </button>
                      {grokThumbUrl && (
                        <a
                          href={`${grokThumbUrl}&download=1`}
                          className="rounded-lg border border-purple-400/50 bg-[#0B0D12] px-2.5 py-1 text-[10px] font-bold text-purple-300"
                        >
                          ⬇️ JPG
                        </a>
                      )}
                    </div>
                  </div>
                </div>
                <div className="truncate text-[11px] text-slate-400">
                  Transcripción detectada: &ldquo;{selectedClipObj.summary || selectedClipObj.title}&rdquo;
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400">Red Social</label>
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-[#0B0D12] p-2.5 text-xs font-bold text-white"
                >
                  <option value="TikTok">TikTok</option>
                  <option value="YouTube">YouTube Shorts</option>
                  <option value="Instagram">Instagram Reels</option>
                  <option value="X">X (Twitter)</option>
                  <option value="LinkedIn">LinkedIn</option>
                  <option value="Facebook">Facebook Reels</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400">Tono de Voz</label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-[#0B0D12] p-2.5 text-xs font-bold text-white"
                >
                  <option value="VIRAL">🔥 Viral & Polémico (Grok)</option>
                  <option value="GROK_SPICY">🌶️ Modo Grok Sin Filtro (Polémico X)</option>
                  <option value="URGENT">🚨 Breaking News</option>
                  <option value="HUMOR">😂 Humor & Comedia</option>
                  <option value="EDUCATIONAL">📚 Educativo / Valor</option>
                  <option value="PROFESSIONAL">💼 Profesional</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400">Idioma del Copy</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-[#0B0D12] p-2.5 text-xs font-bold text-white"
                >
                  <option value="es">🇪🇸 Español</option>
                  <option value="en">🇺🇸 English</option>
                  <option value="pt">🇧🇷 Português</option>
                  <option value="fr">🇫🇷 Français</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400">
                Contexto o ángulo adicional (opcional)
              </label>
              <input
                type="text"
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
                placeholder="Ej. Enfocar en el debate económico o añadir pregunta al final..."
                className="mt-1 w-full rounded-xl border border-slate-700 bg-[#0B0D12] p-2.5 text-xs text-white"
              />
            </div>

            <button
              type="button"
              onClick={handleGenerateAiCopy}
              disabled={generatingAi}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#FFD43B] to-[#FFB703] py-3 text-xs font-black text-[#0B0D12] shadow-lg hover:brightness-105 disabled:opacity-50"
            >
              {generatingAi ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Redactando Copy Viral con IA...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" /> ✨ Generar Título, Copy Viral y Hashtags con IA
                </>
              )}
            </button>

            <div className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs">
              <span className="flex items-center gap-1.5 font-semibold text-amber-200">
                <Clock className="h-4 w-4 text-[#FFD43B]" /> Mejor hora sugerida ({platform}):
              </span>
              <span className="font-black text-[#FFD43B]">{bestTimeRec}</span>
            </div>
          </div>

          {/* Right 7 cols: Post Editor & Queue */}
          <div className="space-y-6 lg:col-span-7">
            <form onSubmit={handleCreatePost} className="studio-card space-y-4 p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-extrabold text-white">
                  2. Revisar y Programar Publicación ({platform})
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(`${title}\n\n${caption}\n\n${hashtags.join(' ')}`);
                    setNotice('📋 Copy + Hashtags copiados al portapapeles.');
                  }}
                  className="flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-300 hover:border-[#FFD43B]"
                >
                  <Copy className="h-3.5 w-3.5" /> Copiar Todo
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400">Título / Gancho Principal</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Pulsa 'Generar con IA' o escribe tu titular..."
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-[#0B0D12] p-2.5 text-xs font-bold text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400">
                  Descripción / Copy Optimizado + Call-To-Action
                </label>
                <textarea
                  required
                  rows={4}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="El asistente AI Copywriter redactará aquí el cuerpo del post..."
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-[#0B0D12] p-2.5 text-xs text-white"
                />
              </div>

              <div>
                <label className="flex items-center gap-1 text-xs font-semibold text-slate-400">
                  <Hash className="h-3.5 w-3.5 text-[#FFD43B]" /> Hashtags en Tendencia
                </label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {hashtags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="rounded-lg border border-[#FFD43B]/30 bg-[#FFD43B]/10 px-2.5 py-1 text-[11px] font-bold text-[#FFD43B]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {xThread.length > 0 && (
                <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-extrabold text-sky-400">
                      🧵 Hilo Viral para X (Twitter) — Generado con {aiEngineUsed}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(xThread.join('\n\n'));
                        setNotice('📋 ¡Hilo de 3 Tweets copiado al portapapeles!');
                      }}
                      className="rounded-lg bg-sky-500/20 px-2.5 py-1 text-[10px] font-bold text-sky-300 hover:bg-sky-500/30"
                    >
                      📋 Copiar Hilo Completo
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {xThread.map((tweet, idx) => (
                      <div
                        key={idx}
                        className="rounded-lg border border-slate-800 bg-[#0B0D12]/90 p-2 text-[11px] text-slate-200"
                      >
                        {tweet}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-400">
                    Fecha y Hora de Programación (Opcional)
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-[#0B0D12] p-2.5 text-xs text-white"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FFD43B] py-2.5 text-xs font-black text-[#0B0D12] shadow hover:bg-[#FFB703]"
                  >
                    <Send className="h-3.5 w-3.5" /> Guardar y Programar en Calendario
                  </button>
                </div>
              </div>
            </form>

            {/* Recent Scheduled Posts */}
            <div className="studio-card p-5">
              <h3 className="mb-3 text-sm font-extrabold text-white">
                Cola de Publicaciones Programadas y Listas ({(data.posts || []).length})
              </h3>
              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                {(data.posts || []).length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-xs text-slate-400">
                    Aún no hay publicaciones en cola. Usa <strong>&ldquo;Generar con IA&rdquo;</strong> o pulsa{' '}
                    <strong>&ldquo;Auto-Programar Mejores Clips&rdquo;</strong> arriba.
                  </div>
                ) : (
                  (data.posts || []).map((p: any) => (
                    <div
                      key={p.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-800 bg-[#0B0D12]/90 p-3.5 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-[#FFD43B]/20 px-2 py-0.5 text-[10px] font-black text-[#FFD43B]">
                            {p.platform}
                          </span>
                          <span className="truncate font-bold text-white">{p.title}</span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-slate-400">{p.caption}</p>
                        {p.scheduledAt && (
                          <div className="mt-1 text-[11px] text-emerald-400 font-semibold">
                            📅 Programado: {new Date(p.scheduledAt).toLocaleString('es-ES')}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {p.clipDownloadUrl && (
                          <a
                            href={p.clipDownloadUrl}
                            download
                            className="rounded-lg border border-slate-700 px-2.5 py-1.5 font-bold text-slate-200 hover:border-[#FFD43B]"
                          >
                            MP4
                          </a>
                        )}
                        <span className="rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 font-bold text-emerald-400">
                          {p.status}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: VISUAL 7-DAY CONTENT CALENDAR */}
      {activeTab === 'CALENDAR' && (
        <div className="studio-card p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-extrabold text-white">
                Calendario Visual de Contenidos (Próximos 7 Días)
              </h2>
              <p className="text-xs text-slate-400">
                Vista panorámica estilo Ocoya de tus Shorts, Reels y TikToks programados por día y hora pico
              </p>
            </div>
            <button
              type="button"
              onClick={handleAutoScheduleWeek}
              disabled={autoScheduling}
              className="rounded-xl bg-[#FFD43B] px-3.5 py-2 text-xs font-black text-[#0B0D12]"
            >
              ⚡ Rellenar Semana con IA
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
            {next7Days.map((day) => (
              <div
                key={day.isoDate}
                className="flex flex-col rounded-2xl border border-slate-800 bg-[#0B0D12]/80 p-3 min-h-[240px]"
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2.5">
                  <span className="text-xs font-extrabold uppercase text-white">{day.dayLabel}</span>
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-[#FFD43B]">
                    {day.dayPosts.length} posts
                  </span>
                </div>

                <div className="flex-1 space-y-2">
                  {day.dayPosts.length === 0 ? (
                    <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-slate-800/70 p-2 text-center text-[11px] text-slate-500">
                      Disponible (Pico: 19:30)
                    </div>
                  ) : (
                    day.dayPosts.map((p: any) => (
                      <div
                        key={p.id}
                        className="rounded-xl border border-[#FFD43B]/30 bg-[#131720] p-2.5 text-[11px] space-y-1 shadow"
                      >
                        <div className="flex items-center justify-between">
                          <span className="rounded bg-[#FFD43B] px-1.5 py-0.5 text-[9px] font-black text-black">
                            {p.platform}
                          </span>
                          <span className="text-[10px] text-emerald-400 font-bold">
                            {p.scheduledAt ? new Date(p.scheduledAt).toTimeString().slice(0, 5) : '19:30'}
                          </span>
                        </div>
                        <div className="font-bold text-white line-clamp-2">{p.title}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: AUTOMATIONS, TELEGRAM BOT, 24/7 CHANNEL WATCHER, WEBHOOKS & BULK CSV */}
      {activeTab === 'AUTOMATIONS' && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Card 1: Telegram Bot Direct Push */}
          <div className="studio-card p-5 space-y-4 border border-sky-500/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="rounded-xl bg-sky-500/15 p-2.5 text-sky-400">
                  <Send className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-white">
                    📱 Bot de Telegram Directo (Del Servidor a tu Celular)
                  </h2>
                  <p className="text-xs text-slate-400">
                    Recibe cada Short MP4 + Copy Viral + Hashtags directo en tu Telegram listo para subir en 1 toque
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-sky-500/20 px-2.5 py-0.5 text-[10px] font-black text-sky-300">
                1-CLIC PUSH
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-300">Telegram Bot Token (@BotFather)</label>
                <input
                  type="password"
                  value={tgBotToken}
                  onChange={(e) => setTgBotToken(e.target.value)}
                  placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-[#0B0D12] p-2.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300">Chat ID o @Canal</label>
                <input
                  type="text"
                  value={tgChatId}
                  onChange={(e) => setTgChatId(e.target.value)}
                  placeholder="Ej. 987654321 o @micanalviral"
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-[#0B0D12] p-2.5 text-xs text-white"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={tgAutoSendLive}
                onChange={(e) => setTgAutoSendLive(e.target.checked)}
                className="h-4 w-4 rounded accent-[#FFD43B]"
              />
              Auto-Enviar automáticamente cada nuevo Mejor Momento de Live Clipper a mi Telegram
            </label>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                onClick={handleSaveTelegramConfig}
                disabled={savingTg}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-sky-400/50 bg-sky-500/15 py-2.5 text-xs font-bold text-sky-300 hover:bg-sky-500/25 disabled:opacity-40"
              >
                💾 Guardar Configuración Telegram
              </button>
              <button
                type="button"
                onClick={handleSendTelegramNow}
                disabled={sendingTg}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-[#FFD43B] py-2.5 text-xs font-black text-[#0B0D12] hover:brightness-105 disabled:opacity-40"
              >
                <Send className="h-3.5 w-3.5" /> 📱 Enviar Clip Actual a Telegram Ahora
              </button>
            </div>
          </div>

          {/* Card 2: 24/7 Auto-Channel Watcher */}
          <div className="studio-card p-5 space-y-4 border border-amber-500/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="rounded-xl bg-[#FFD43B]/15 p-2.5 text-[#FFD43B]">
                  <Zap className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-white">
                    📡 Vigilante Automático de Canales 24/7 (Auto-Watcher)
                  </h2>
                  <p className="text-xs text-slate-400">
                    Monitorea canales de YouTube/Twitch y extrae los Mejores Momentos apenas detecta video o directo nuevo
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-black text-emerald-300">
                24/7 ACTIVO
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300">URL del Canal o Directo</label>
                <input
                  type="url"
                  value={newChannelUrl}
                  onChange={(e) => setNewChannelUrl(e.target.value)}
                  placeholder="https://www.youtube.com/@Canal/streams"
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-[#0B0D12] p-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-300">Nombre del Canal</label>
                <input
                  type="text"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  placeholder="Ej. Canal Noticias / Streamer"
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-[#0B0D12] p-2 text-xs text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10px] font-semibold text-slate-400">🎮 Pantalla Dividida 50/50</label>
                <select
                  value={newChannelSplitMode}
                  onChange={(e) => setNewChannelSplitMode(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-[#0B0D12] p-2 text-[11px] font-bold text-white"
                >
                  <option value="NONE">9:16 Normal</option>
                  <option value="HYPNOTIC_TUNNEL">🌀 Túnel Hipnótico 50/50</option>
                  <option value="NEON_RAMP">🌈 Rampa Neón 50/50</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-400">🗣️ Auto-Doblaje IA</label>
                <select
                  value={newChannelDubLang}
                  onChange={(e) => setNewChannelDubLang(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-[#0B0D12] p-2 text-[11px] font-bold text-white"
                >
                  <option value="NONE">Voz Original</option>
                  <option value="ES_LATAM">🇲🇽 Español LatAm</option>
                  <option value="EN_US">🇺🇸 Inglés</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={handleAddWatchedChannel}
                className="rounded-xl border border-[#FFD43B] bg-[#FFD43B]/15 py-2 text-xs font-bold text-[#FFD43B] hover:bg-[#FFD43B] hover:text-black transition"
              >
                ➕ Agregar Canal al Vigilante
              </button>
              <button
                type="button"
                onClick={() => handleScanChannelNow()}
                disabled={scanningWatcher || watchedChannels.length === 0}
                className="rounded-xl bg-emerald-500 py-2 text-xs font-black text-slate-950 hover:bg-emerald-400 disabled:opacity-40"
              >
                {scanningWatcher ? 'Escaneando...' : '⚡ Escanear Canal y Sacar Cortes Ahora'}
              </button>
            </div>

            {watchedChannels.length > 0 && (
              <div className="space-y-1.5 max-h-36 overflow-y-auto pt-1">
                {watchedChannels.map((ch: any) => (
                  <div
                    key={ch.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-[#0B0D12] px-3 py-2 text-[11px]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold text-white">{ch.channelName}</div>
                      <div className="truncate text-slate-400">
                        {ch.lastDetectedTitle ? `Último: ${ch.lastDetectedTitle}` : ch.channelUrl}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleScanChannelNow(ch.id)}
                        className="rounded bg-[#FFD43B] px-2 py-1 text-[10px] font-black text-black"
                      >
                        Escanear
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteWatchedChannel(ch.id)}
                        className="rounded bg-red-500/20 px-2 py-1 text-[10px] font-bold text-red-400"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="studio-card p-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="rounded-xl bg-[#FFD43B]/15 p-2.5 text-[#FFD43B]">
                <Webhook className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-white">
                  Webhook de Automatización (n8n / Make / Zapier)
                </h2>
                <p className="text-xs text-slate-400">
                  Envía automáticamente el MP4, título viral, copy y hashtags a tu flujo de n8n o servidor externo
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300">URL del Webhook (POST JSON)</label>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://n8n.tudominio.com/webhook/banana-clips"
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-[#0B0D12] p-2.5 text-xs text-white"
              />
            </div>

            <button
              type="button"
              onClick={handlePushWebhook}
              disabled={sendingWebhook || !webhookUrl.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FFD43B] py-2.5 text-xs font-black text-[#0B0D12] disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" /> Probar y Enviar Última Publicación al Webhook
            </button>
          </div>

          <div className="studio-card p-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="rounded-xl bg-emerald-500/15 p-2.5 text-emerald-400">
                <Globe className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-white">
                  Exportación Masiva CSV & Auto-Sync de Directos
                </h2>
                <p className="text-xs text-slate-400">
                  Descarga toda tu programación en formato CSV compatible con Ocoya, Metricool y hojas de cálculo
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#0B0D12] p-3.5 text-xs text-slate-300 space-y-1">
              <div className="font-bold text-white">✅ Regla Activa: Live Clipper → Galería → Calendario</div>
              <p className="text-slate-400">
                Cada vez que conectas un directo de YouTube en <strong>Live Clipper</strong>, los cortes con Score 85+ quedan listos para auto-programarse en 1 clic con copy de IA.
              </p>
            </div>

            <button
              type="button"
              onClick={handleExportCsv}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#FFD43B] bg-[#FFD43B]/10 py-2.5 text-xs font-black text-[#FFD43B] hover:bg-[#FFD43B] hover:text-[#0B0D12] transition"
            >
              <Download className="h-4 w-4" /> Descargar Calendario Completo (.CSV)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
