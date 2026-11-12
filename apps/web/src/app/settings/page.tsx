'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch, useStudioStore } from '@/lib/store';
import { useRouter } from 'next/navigation';
import {
  Lock,
  CheckCircle2,
  Send,
  Sliders,
  Sparkles,
  Palette,
  Cpu,
  HardDrive,
  Radio,
  Trash2,
  PlusCircle,
  Loader2,
  User,
  ShieldCheck,
  Zap,
} from 'lucide-react';

type SettingsSection =
  | 'TELEGRAM'
  | 'CLIPPER_DEFAULTS'
  | 'BRAND_KIT'
  | 'AI_ENGINES'
  | 'CHANNEL_WATCHER'
  | 'STORAGE_CLEANUP'
  | 'SECURITY';

export default function SettingsPage() {
  const { user, setAuth } = useStudioStore();
  const router = useRouter();

  const [activeSection, setActiveSection] = useState<SettingsSection>('TELEGRAM');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [testingTg, setTestingTg] = useState<boolean>(false);
  const [scanningWatcher, setScanningWatcher] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 1. Profile & Password State
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // 2. Telegram Config State
  const [tgBotToken, setTgBotToken] = useState('');
  const [tgChatId, setTgChatId] = useState('');
  const [tgAutoSendLive, setTgAutoSendLive] = useState(true);
  const [tgAutoSendAiClips, setTgAutoSendAiClips] = useState(true);
  const [tgIncludeHashtags, setTgIncludeHashtags] = useState(true);
  const [tgBotUsername, setTgBotUsername] = useState('');
  const [tgBotVerified, setTgBotVerified] = useState(false);

  // 3. Clipper Defaults State (Formato 9:16, Split, Corner, Clips, Duración)
  const [defaultClipDurationSec, setDefaultClipDurationSec] = useState<number>(30);
  const [defaultMaxClipsCount, setDefaultMaxClipsCount] = useState<number>(3);
  const [defaultAspectRatio, setDefaultAspectRatio] = useState<string>('9:16');
  const [defaultSplitScreenMode, setDefaultSplitScreenMode] = useState<string>('NONE');
  const [defaultFacecamCorner, setDefaultFacecamCorner] = useState<string>('AUTO');
  const [defaultSpeechLanguage, setDefaultSpeechLanguage] = useState<string>('Spanish');
  const [burnSubtitlesByDefault, setBurnSubtitlesByDefault] = useState<boolean>(true);
  const [hookBannerByDefault, setHookBannerByDefault] = useState<boolean>(true);
  const [audioEnhancerByDefault, setAudioEnhancerByDefault] = useState<boolean>(true);
  const [speechCleanupByDefault, setSpeechCleanupByDefault] = useState<boolean>(true);
  const [autoColorCorrectionByDefault, setAutoColorCorrectionByDefault] = useState<boolean>(true);
  const [defaultBackgroundMusic, setDefaultBackgroundMusic] = useState<string>('NONE');

  // 4. Brand Kit & Subtitles State
  const [watermarkText, setWatermarkText] = useState('');
  const [watermarkPosition, setWatermarkPosition] = useState('TOP_RIGHT');
  const [watermarkScalePx, setWatermarkScalePx] = useState(140);
  const [ctaOutroEnabled, setCtaOutroEnabled] = useState(false);
  const [ctaOutroText, setCtaOutroText] = useState('SÍGUENOS Y COMPARTE PARA MÁS');
  const [primaryColor, setPrimaryColor] = useState('#FFD43B');
  const [accentColor, setAccentColor] = useState('#FF2020');
  const [subtitleTemplate, setSubtitleTemplate] = useState('Bold');
  const [captionPresetId, setCaptionPresetId] = useState('WordCut');

  // 5. AI Engines & Credit Protection State
  const [primaryBrain, setPrimaryBrain] = useState('CLAUDE_5_5_AND_NIM_FREE');
  const [protectGrokCredits, setProtectGrokCredits] = useState(true);
  const [whisperModel, setWhisperModel] = useState('base');
  const [hardwareProfile, setHardwareProfile] = useState('NVIDIA_LOW_VRAM');

  // 6. 24/7 Auto-Channel Watcher State
  const [watchedChannels, setWatchedChannels] = useState<any[]>([]);
  const [newChannelUrl, setNewChannelUrl] = useState('https://www.youtube.com/@Alofokeradioshow/streams');
  const [newChannelName, setNewChannelName] = useState('Alofoke Radio Show');
  const [newChannelIntervalMin, setNewChannelIntervalMin] = useState(15);
  const [newChannelClipDur, setNewChannelClipDur] = useState(25);
  const [newChannelSplitMode, setNewChannelSplitMode] = useState('NONE');

  // 7. Storage & Disk Summary State
  const [storageStats, setStorageStats] = useState<{
    videosCount: number;
    clipsCount: number;
    storageBytesUsed: number;
  }>({
    videosCount: 0,
    clipsCount: 0,
    storageBytesUsed: 0,
  });

  const loadAllSettings = async () => {
    setLoading(true);
    try {
      // Load local cache first so UI never flashes empty
      try {
        const cached = localStorage.getItem('banana_telegram_config');
        if (cached) {
          const parsedCache = JSON.parse(cached);
          if (parsedCache.botToken) setTgBotToken(parsedCache.botToken);
          if (parsedCache.chatId) setTgChatId(parsedCache.chatId);
        }
      } catch {}

      const [prefRes, tgDirectRes, chRes, dashRes] = await Promise.all([
        apiFetch<any>('/settings/preferences').catch(() => null),
        apiFetch<{ config: any }>('/social/telegram-config').catch(() => null),
        apiFetch<{ channels: any[] }>('/channel-watcher').catch(() => ({ channels: [] })),
        apiFetch<any>('/dashboard').catch(() => null),
      ]);

      const tgSource = prefRes?.telegramConfig?.botToken
        ? prefRes.telegramConfig
        : tgDirectRes?.config?.botToken
          ? tgDirectRes.config
          : prefRes?.telegramConfig || tgDirectRes?.config;

      if (tgSource) {
        if (tgSource.botToken) setTgBotToken(tgSource.botToken);
        if (tgSource.chatId) setTgChatId(tgSource.chatId);
        setTgAutoSendLive(tgSource.autoSendLiveClips !== false);
        setTgAutoSendAiClips(tgSource.autoSendAiClips !== false);
        setTgIncludeHashtags(tgSource.includeViralHashtags !== false);
        setTgBotUsername(tgSource.botUsername || '');
        setTgBotVerified(Boolean(tgSource.botVerified));
        if (tgSource.botToken || tgSource.chatId) {
          try {
            localStorage.setItem(
              'banana_telegram_config',
              JSON.stringify({ botToken: tgSource.botToken, chatId: tgSource.chatId })
            );
          } catch {}
        }
      }

      if (prefRes) {
        if (prefRes.profile) {
          setFullName(prefRes.profile.fullName || user?.fullName || '');
          setEmail(prefRes.profile.email || user?.email || '');
        }
        if (prefRes.clipperPresets) {
          const cp = prefRes.clipperPresets;
          setDefaultClipDurationSec(Number(cp.defaultClipDurationSec || 30));
          setDefaultMaxClipsCount(Number(cp.defaultMaxClipsCount || 3));
          setDefaultAspectRatio(cp.defaultAspectRatio || '9:16');
          setDefaultSplitScreenMode(cp.defaultSplitScreenMode || 'NONE');
          setDefaultFacecamCorner(cp.defaultFacecamCorner || 'AUTO');
          setDefaultSpeechLanguage(cp.defaultSpeechLanguage || 'Spanish');
          setBurnSubtitlesByDefault(cp.burnSubtitlesByDefault !== false);
          setHookBannerByDefault(cp.hookBannerByDefault !== false);
          setAudioEnhancerByDefault(cp.audioEnhancerByDefault !== false);
          setSpeechCleanupByDefault(cp.speechCleanupByDefault !== false);
          setAutoColorCorrectionByDefault(cp.autoColorCorrectionByDefault !== false);
          setDefaultBackgroundMusic(cp.defaultBackgroundMusic || 'NONE');
        }
        if (prefRes.brandKit) {
          const bk = prefRes.brandKit;
          setWatermarkText(bk.watermarkText || '');
          setWatermarkPosition(bk.watermarkPosition || 'TOP_RIGHT');
          setWatermarkScalePx(Number(bk.watermarkScalePx || 140));
          setCtaOutroEnabled(Boolean(bk.ctaOutroEnabled));
          setCtaOutroText(bk.ctaOutroText || 'SÍGUENOS Y COMPARTE PARA MÁS');
          setPrimaryColor(bk.primaryColor || '#FFD43B');
          setAccentColor(bk.accentColor || '#FF2020');
          setSubtitleTemplate(bk.subtitleTemplate || 'Bold');
          setCaptionPresetId(bk.captionPresetId || 'WordCut');
        }
        if (prefRes.aiEngineConfig) {
          const ai = prefRes.aiEngineConfig;
          setPrimaryBrain(ai.primaryBrain || 'CLAUDE_5_5_AND_NIM_FREE');
          setProtectGrokCredits(ai.protectGrokCredits !== false);
          setWhisperModel(ai.whisperModel || 'base');
          setHardwareProfile(ai.hardwareProfile || 'NVIDIA_LOW_VRAM');
        }
      }

      setWatchedChannels(chRes?.channels || []);

      if (dashRes?.stats) {
        setStorageStats({
          videosCount: Number(dashRes.stats.videosProcessed || 0),
          clipsCount: Number(dashRes.stats.clipsCreated || 0),
          storageBytesUsed: Number(dashRes.stats.storageBytesUsed || 0),
        });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllSettings();
  }, []);

  const handleSaveAllSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    setMessage(null);
    setErrorMsg(null);
    try {
      const cleanToken = tgBotToken.trim();
      const cleanChatId = tgChatId.trim();
      try {
        localStorage.setItem(
          'banana_telegram_config',
          JSON.stringify({ botToken: cleanToken, chatId: cleanChatId })
        );
      } catch {}

      const res = await apiFetch<{ saved: boolean; message: string; telegramConfig?: any }>('/settings/preferences', {
        method: 'PUT',
        body: JSON.stringify({
          profile: { fullName, email },
          telegramConfig: {
            botToken: cleanToken,
            chatId: cleanChatId,
            autoSendLiveClips: tgAutoSendLive,
            autoSendAiClips: tgAutoSendAiClips,
            includeViralHashtags: tgIncludeHashtags,
          },
          clipperPresets: {
            defaultClipDurationSec,
            defaultMaxClipsCount,
            defaultAspectRatio,
            defaultSplitScreenMode,
            defaultFacecamCorner,
            defaultSpeechLanguage,
            burnSubtitlesByDefault,
            hookBannerByDefault,
            audioEnhancerByDefault,
            speechCleanupByDefault,
            autoColorCorrectionByDefault,
            defaultBackgroundMusic,
          },
          brandKit: {
            watermarkText,
            watermarkPosition,
            watermarkScalePx,
            ctaOutroEnabled,
            ctaOutroText,
            primaryColor,
            accentColor,
            subtitleTemplate,
            captionPresetId,
          },
          aiEngineConfig: {
            primaryBrain,
            protectGrokCredits,
            whisperModel,
            hardwareProfile,
          },
        }),
      });
      if (res.telegramConfig) {
        setTgBotToken(res.telegramConfig.botToken || cleanToken);
        setTgChatId(res.telegramConfig.chatId || cleanChatId);
        setTgBotUsername(res.telegramConfig.botUsername || '');
        setTgBotVerified(Boolean(res.telegramConfig.botVerified));
      }
      setMessage(res.message || '✅ Configuraciones guardadas correctamente.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al guardar las configuraciones.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestTelegramSend = async (testMessageOnly = false) => {
    setTestingTg(true);
    setMessage(null);
    setErrorMsg(null);
    try {
      await handleSaveAllSettings();
      const res = await apiFetch<{ ok: boolean; message: string }>('/social/telegram-send', {
        method: 'POST',
        body: JSON.stringify({
          botToken: tgBotToken.trim(),
          chatId: tgChatId.trim(),
          testMessageOnly,
        }),
      });
      setMessage(res.message || '✅ Prueba enviada con éxito a tu Telegram.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'No se pudo enviar la prueba a Telegram. Verifica tu Bot Token y Chat ID.');
    } finally {
      setTestingTg(false);
    }
  };

  const handleAddWatchedChannel = async () => {
    if (!newChannelUrl.trim()) return;
    setMessage(null);
    setErrorMsg(null);
    try {
      const res = await apiFetch<{ channels: any[] }>('/channel-watcher', {
        method: 'POST',
        body: JSON.stringify({
          channelUrl: newChannelUrl.trim(),
          channelName: newChannelName.trim() || 'Canal de YouTube',
          checkIntervalMin: newChannelIntervalMin,
          clipDurationSec: newChannelClipDur,
          splitScreenMode: newChannelSplitMode,
        }),
      });
      setWatchedChannels(res.channels || []);
      setMessage('📡 Canal agregado al Vigilante Automático 24/7.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al agregar el canal al Vigilante 24/7.');
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

  const handleScanWatcherNow = async (channelId?: string) => {
    setScanningWatcher(true);
    setMessage(null);
    try {
      const res = await apiFetch<{ message: string; channels: any[] }>('/channel-watcher/scan-now', {
        method: 'POST',
        body: JSON.stringify({ channelId }),
      });
      setWatchedChannels(res.channels || []);
      setMessage(res.message);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al escanear el canal.');
    } finally {
      setScanningWatcher(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setErrorMsg(null);
    try {
      const res = await apiFetch<{ accessToken: string }>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (user) {
        setAuth({ ...user, mustChangePassword: false }, res.accessToken);
      }
      setMessage('🔐 Contraseña actualizada correctamente.');
      setCurrentPassword('');
      setNewPassword('');
      if (user?.mustChangePassword) {
        setTimeout(() => router.push('/dashboard'), 1000);
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const formatBytes = (bytes: number) => {
    const mb = Number(bytes || 0) / (1024 * 1024);
    if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
    return `${mb.toFixed(2)} MB`;
  };

  const SECTIONS: Array<{ id: SettingsSection; label: string; badge?: string; icon: any }> = [
    { id: 'TELEGRAM', label: '📱 Bot de Telegram & Auto-Envío', badge: 'DIRECTO', icon: Send },
    { id: 'CLIPPER_DEFAULTS', label: '✂️ Ajustes de Shorts & Split 9:16', icon: Sliders },
    { id: 'BRAND_KIT', label: '🎨 Brand Kit, Subtítulos & Marca', icon: Palette },
    { id: 'AI_ENGINES', label: '🧠 Motores IA & Ahorro de Créditos', badge: '$0 GROK', icon: Cpu },
    { id: 'CHANNEL_WATCHER', label: '📡 Vigilante 24/7 de Canales', icon: Radio },
    { id: 'STORAGE_CLEANUP', label: '💾 Almacenamiento & Disco /data', icon: HardDrive },
    { id: 'SECURITY', label: '🔐 Cuenta & Contraseña', icon: Lock },
  ];

  return (
    <div className="space-y-6 pb-14">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#F8FAFC]">
            Centro de Configuración Maestra — Banana Clips Studio
          </h1>
          <p className="text-xs text-[#94A3B8]">
            Configura tu Bot de Telegram, formato predeterminado de Shorts 9:16, cámara del streamer, subtítulos, motores IA ($0 créditos Grok), Vigilante 24/7 y seguridad
          </p>
        </div>

        <button
          type="button"
          disabled={saving}
          onClick={() => handleSaveAllSettings()}
          className="flex items-center gap-2 rounded-xl bg-[#FFD43B] px-5 py-2.5 text-xs font-black text-[#111318] shadow-lg transition hover:bg-amber-400 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          <span>{saving ? 'Guardando...' : 'Guardar Todas las Configuraciones'}</span>
        </button>
      </div>

      {user?.mustChangePassword && (
        <div
          data-testid="force-password-change-banner"
          className="rounded-xl border border-amber-500/50 bg-amber-500/15 p-4 text-xs text-amber-200"
        >
          <strong>Cambio obligatorio de contraseña inicial:</strong> Estás iniciando sesión con una contraseña temporal asignada por el SUPER_ADMIN. Por seguridad debes definir una nueva contraseña antes de continuar.
        </div>
      )}

      {message && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/15 p-3.5 text-xs font-bold text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> <span>{message}</span>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/15 p-3.5 text-xs font-bold text-red-300">
          {errorMsg}
        </div>
      )}

      {/* Main Layout: Left Sidebar Navigation + Right Configuration Panel */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Navigation (4 cols) */}
        <div className="space-y-2 lg:col-span-4">
          <div className="rounded-2xl border border-slate-800 bg-[#14171F] p-3 space-y-1.5">
            {SECTIONS.map((sec) => {
              const Icon = sec.icon;
              const isAct = activeSection === sec.id;
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => setActiveSection(sec.id)}
                  className={`flex w-full items-center justify-between rounded-xl px-3.5 py-3 text-left text-xs font-bold transition ${
                    isAct
                      ? 'bg-[#FFD43B] text-[#111318] shadow'
                      : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{sec.label}</span>
                  </div>
                  {sec.badge && (
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-black ${
                        isAct ? 'bg-[#111318] text-[#FFD43B]' : 'bg-emerald-500/20 text-emerald-300'
                      }`}
                    >
                      {sec.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Quick Status Card */}
          <div className="rounded-2xl border border-slate-800 bg-[#14171F] p-4 space-y-2.5 text-xs">
            <div className="flex items-center justify-between font-bold text-white">
              <span>Estado de Integraciones</span>
              <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-400">ACTIVO</span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>Bot de Telegram:</span>
              <span className={tgBotToken && tgChatId ? 'font-bold text-emerald-400' : 'text-amber-400'}>
                {tgBotToken && tgChatId ? 'Conectado ✓' : 'Pendiente configurar'}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>Motor IA Principal:</span>
              <span className="font-bold text-[#FFD43B]">Claude 5.5 + NIM ($0)</span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>Espacio en /data:</span>
              <span className="font-bold text-white">{formatBytes(storageStats.storageBytesUsed)}</span>
            </div>
          </div>
        </div>

        {/* Right Panel (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* 1. TELEGRAM CONFIGURATION */}
          {activeSection === 'TELEGRAM' && (
            <div className="rounded-3xl border border-slate-800 bg-[#1B1E25] p-6 shadow-2xl space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-4">
                <div>
                  <span className="rounded bg-sky-500/20 px-2.5 py-0.5 text-[10px] font-black text-sky-300">
                    DEL SERVIDOR A TU CELULAR EN 1 CLIC
                  </span>
                  <h2 className="mt-1 text-lg font-extrabold text-white">
                    📱 Configuración de Bot de Telegram Directo
                  </h2>
                  <p className="text-xs text-slate-400">
                    Recibe cada Short 9:16 renderizado (archivo MP4 + Título + Virality Score + Hashtags) directamente en tu Telegram
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-sky-300">
                    Telegram Bot Token (@BotFather)
                  </label>
                  <input
                    type="text"
                    value={tgBotToken}
                    onChange={(e) => setTgBotToken(e.target.value)}
                    placeholder="Ej: 7123456789:AAH_tu_token_de_botfather..."
                    className="w-full rounded-xl border border-slate-700 bg-[#111318] p-3 text-xs text-white focus:border-[#FFD43B] focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    Créalo gratis hablando con <strong>@BotFather</strong> en Telegram con el comando <code>/newbot</code>.
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-sky-300">
                    Telegram Chat ID o Canal (@canal o ID numérico)
                  </label>
                  <input
                    type="text"
                    value={tgChatId}
                    onChange={(e) => setTgChatId(e.target.value)}
                    placeholder="Ej: 123456789 o -1001987654321 o @micanal"
                    className="w-full rounded-xl border border-slate-700 bg-[#111318] p-3 text-xs text-white focus:border-[#FFD43B] focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    Obtén tu ID escribiéndole a <strong>@userinfobot</strong> en Telegram.
                  </p>
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-slate-800 bg-[#111318] p-4 text-xs">
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <div className="font-bold text-white">Auto-Enviar Cortes de AI Clipping al terminar</div>
                    <div className="text-[11px] text-slate-400">
                      Envía automáticamente los mejores Shorts a tu Telegram apenas finaliza el renderizado
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={tgAutoSendAiClips}
                    onChange={(e) => setTgAutoSendAiClips(e.target.checked)}
                    className="h-4 w-4 accent-[#FFD43B]"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer border-t border-slate-800 pt-3">
                  <div>
                    <div className="font-bold text-white">Auto-Enviar Cortes de Directos En Vivo (Live Clipper)</div>
                    <div className="text-[11px] text-slate-400">
                      Cada vez que el Live Clipper o el Vigilante 24/7 extraiga un corte en vivo, lo envía a tu celular
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={tgAutoSendLive}
                    onChange={(e) => setTgAutoSendLive(e.target.checked)}
                    className="h-4 w-4 accent-[#FFD43B]"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer border-t border-slate-800 pt-3">
                  <div>
                    <div className="font-bold text-white">Incluir Copy Viral y Hashtags en el mensaje</div>
                    <div className="text-[11px] text-slate-400">
                      Adjunta el título gancho, puntuación de viralidad y hashtags listos para copiar y pegar en TikTok/Shorts/Reels
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={tgIncludeHashtags}
                    onChange={(e) => setTgIncludeHashtags(e.target.checked)}
                    className="h-4 w-4 accent-[#FFD43B]"
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleSaveAllSettings()}
                  className="flex items-center gap-2 rounded-xl bg-[#FFD43B] px-5 py-2.5 text-xs font-black text-[#111318] hover:bg-amber-400 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" /> Guardar Configuración de Telegram
                </button>

                <button
                  type="button"
                  disabled={testingTg || !tgBotToken.trim() || !tgChatId.trim()}
                  onClick={() => handleTestTelegramSend(true)}
                  className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-2.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-40"
                >
                  {testingTg ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  <span>🔍 Verificar Conexión (Mensaje)</span>
                </button>

                <button
                  type="button"
                  disabled={testingTg || !tgBotToken.trim() || !tgChatId.trim()}
                  onClick={() => handleTestTelegramSend(false)}
                  className="flex items-center gap-2 rounded-xl border border-sky-500/40 bg-sky-500/15 px-4 py-2.5 text-xs font-bold text-sky-300 hover:bg-sky-500/30 disabled:opacity-40"
                >
                  {testingTg ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  <span>📲 Probar Envío con mi Último Clip</span>
                </button>
              </div>
            </div>
          )}

          {/* 2. CLIPPER DEFAULTS */}
          {activeSection === 'CLIPPER_DEFAULTS' && (
            <div className="rounded-3xl border border-slate-800 bg-[#1B1E25] p-6 shadow-2xl space-y-5">
              <div className="border-b border-slate-800 pb-4">
                <h2 className="text-lg font-extrabold text-white">
                  ✂️ Ajustes Predeterminados de Shorts & Split 9:16
                </h2>
                <p className="text-xs text-slate-400">
                  Define cómo quieres que se creen tus Shorts por defecto al clipear desde el Buscador de YouTube, Radar Viral o AI Clipping
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-[#FFD43B]">
                    Modo de Encuadre / Split 9:16 Predeterminado
                  </label>
                  <select
                    value={defaultSplitScreenMode}
                    onChange={(e) => setDefaultSplitScreenMode(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-[#111318] p-3 text-xs font-bold text-white"
                  >
                    <option value="NONE">✨ Auto IA (Detecta Cámara Streamer, Podcast o Deportes)</option>
                    <option value="STREAMER_FACECAM_SPLIT">📹 Forzar Split 9:16 (Creador Arriba + Juego Abajo)</option>
                    <option value="WIDE_ACTION_BLUR">🏟️ Deportes / Trailer Wide (Fondo Difuminado)</option>
                    <option value="HYPNOTIC_TUNNEL">🌀 Split 50/50 Túnel Hipnótico</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-emerald-400">
                    Posición de Cámara del Streamer (Modo Split 9:16)
                  </label>
                  <select
                    value={defaultFacecamCorner}
                    onChange={(e) => setDefaultFacecamCorner(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-[#111318] p-3 text-xs font-bold text-white"
                  >
                    <option value="AUTO">🤖 Auto-Detectar Esquina con IA</option>
                    <option value="TOP_LEFT">↖ Esquina Superior Izquierda (ej. RDjavi / Ibai)</option>
                    <option value="TOP_RIGHT">↗ Esquina Superior Derecha</option>
                    <option value="BOTTOM_LEFT">↙ Esquina Inferior Izquierda</option>
                    <option value="BOTTOM_RIGHT">↘ Esquina Inferior Derecha</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-300">
                    Cantidad de Clips a Extraer por Video
                  </label>
                  <select
                    value={defaultMaxClipsCount}
                    onChange={(e) => setDefaultMaxClipsCount(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-700 bg-[#111318] p-3 text-xs font-bold text-white"
                  >
                    <option value={1}>1 Clip Top</option>
                    <option value={3}>3 Clips Virales (Recomendado)</option>
                    <option value={5}>5 Clips Virales</option>
                    <option value={7}>7 Clips Virales</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-300">
                    Duración Objetivo por Clip (Segundos)
                  </label>
                  <select
                    value={defaultClipDurationSec}
                    onChange={(e) => setDefaultClipDurationSec(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-700 bg-[#111318] p-3 text-xs font-bold text-white"
                  >
                    <option value={20}>20 segundos (Ultra Dinámico)</option>
                    <option value={30}>30 segundos (Ideal Shorts / TikTok)</option>
                    <option value={35}>35 segundos</option>
                    <option value={45}>45 segundos</option>
                    <option value={60}>60 segundos (Historia Completa)</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-300">
                    Idioma Principal de Transcripción (Faster-Whisper)
                  </label>
                  <select
                    value={defaultSpeechLanguage}
                    onChange={(e) => setDefaultSpeechLanguage(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-[#111318] p-3 text-xs font-bold text-white"
                  >
                    <option value="Spanish">Español</option>
                    <option value="English">Inglés</option>
                    <option value="Portuguese">Portugués</option>
                    <option value="Auto">Auto-Detectar</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-300">
                    Música Viral de Fondo Predeterminada (Auto-Ducking)
                  </label>
                  <select
                    value={defaultBackgroundMusic}
                    onChange={(e) => setDefaultBackgroundMusic(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-[#111318] p-3 text-xs font-bold text-[#FFD43B]"
                  >
                    <option value="NONE">Sin Música Adicional (Audio Original Limpio)</option>
                    <option value="BREAKING_TENSION">🚨 Breaking Tension</option>
                    <option value="PHONK_DRIFT">🔥 Phonk Drift</option>
                    <option value="EPIC_CINEMA">🎬 Épico Cine</option>
                    <option value="LOFI_CHILL">☕ Lo-Fi Chill</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-800 bg-[#111318] p-4 text-xs sm:grid-cols-2">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="font-bold text-white">Quemar Subtítulos Virales (1-2 palabras)</span>
                  <input
                    type="checkbox"
                    checked={burnSubtitlesByDefault}
                    onChange={(e) => setBurnSubtitlesByDefault(e.target.checked)}
                    className="h-4 w-4 accent-[#FFD43B]"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="font-bold text-white">Titular Gancho Inicial (Hook 2 Líneas)</span>
                  <input
                    type="checkbox"
                    checked={hookBannerByDefault}
                    onChange={(e) => setHookBannerByDefault(e.target.checked)}
                    className="h-4 w-4 accent-[#FFD43B]"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="font-bold text-white">Audio Enhancer (Compresor + Filtro Voz)</span>
                  <input
                    type="checkbox"
                    checked={audioEnhancerByDefault}
                    onChange={(e) => setAudioEnhancerByDefault(e.target.checked)}
                    className="h-4 w-4 accent-[#FFD43B]"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="font-bold text-white">Eliminar Muletillas y Silencios</span>
                  <input
                    type="checkbox"
                    checked={speechCleanupByDefault}
                    onChange={(e) => setSpeechCleanupByDefault(e.target.checked)}
                    className="h-4 w-4 accent-[#FFD43B]"
                  />
                </label>
              </div>
            </div>
          )}

          {/* 3. BRAND KIT & SUBTITLES */}
          {activeSection === 'BRAND_KIT' && (
            <div className="rounded-3xl border border-slate-800 bg-[#1B1E25] p-6 shadow-2xl space-y-5">
              <div className="border-b border-slate-800 pb-4">
                <h2 className="text-lg font-extrabold text-white">
                  🎨 Brand Kit, Estilo de Subtítulos y Marca de Agua
                </h2>
                <p className="text-xs text-slate-400">
                  Personaliza la tipografía de tus Shorts (estilo Alofoke / Hormozi / GTA VI), tu marca de agua y el llamado a la acción final
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-[#FFD43B]">
                    Plantilla de Subtítulos Quemados (ASS)
                  </label>
                  <select
                    value={subtitleTemplate}
                    onChange={(e) => setSubtitleTemplate(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-[#111318] p-3 text-xs font-bold text-white"
                  >
                    <option value="Bold">🔥 Impact Bold Viral (1-2 Palabras • Borde Negro Grueso)</option>
                    <option value="Hormozi">⚡ Hormozi Pop (Amarillo / Verde / Rojo Dinámico)</option>
                    <option value="Karaoke">🎤 Karaoke Word Highlight</option>
                    <option value="Neon">💎 Neon Glow</option>
                    <option value="Gaming">🎮 Gaming Impact</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-300">
                    Texto de Marca de Agua (@TuCanal)
                  </label>
                  <input
                    type="text"
                    value={watermarkText}
                    onChange={(e) => setWatermarkText(e.target.value)}
                    placeholder="Dejar vacío para Shorts limpios o escribe ej: @MiCanalClips"
                    className="w-full rounded-xl border border-slate-700 bg-[#111318] p-3 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-300">
                    Posición de Marca de Agua / Logo
                  </label>
                  <select
                    value={watermarkPosition}
                    onChange={(e) => setWatermarkPosition(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-[#111318] p-3 text-xs font-bold text-white"
                  >
                    <option value="TOP_RIGHT">↗ Arriba a la Derecha</option>
                    <option value="TOP_LEFT">↖ Arriba a la Izquierda</option>
                    <option value="BOTTOM_RIGHT">↘ Abajo a la Derecha</option>
                    <option value="BOTTOM_LEFT">↙ Abajo a la Izquierda</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-300">
                    Texto de Cierre CTA (Últimos 2.5s)
                  </label>
                  <input
                    type="text"
                    value={ctaOutroText}
                    onChange={(e) => setCtaOutroText(e.target.value)}
                    placeholder="SÍGUENOS Y COMPARTE PARA MÁS"
                    className="w-full rounded-xl border border-slate-700 bg-[#111318] p-3 text-xs text-white"
                  />
                </div>
              </div>

              <label className="flex items-center justify-between rounded-2xl border border-slate-800 bg-[#111318] p-4 text-xs cursor-pointer">
                <div>
                  <div className="font-bold text-white">Mostrar Banner CTA en los últimos 2.5 segundos</div>
                  <div className="text-[11px] text-slate-400">
                    Desactivado por defecto para mantener el estilo limpio de los Shorts de referencia
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={ctaOutroEnabled}
                  onChange={(e) => setCtaOutroEnabled(e.target.checked)}
                  className="h-4 w-4 accent-[#FFD43B]"
                />
              </label>
            </div>
          )}

          {/* 4. AI ENGINES & CREDIT PROTECTION */}
          {activeSection === 'AI_ENGINES' && (
            <div className="rounded-3xl border border-slate-800 bg-[#1B1E25] p-6 shadow-2xl space-y-5">
              <div className="border-b border-slate-800 pb-4">
                <span className="rounded bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-black text-emerald-300">
                  MODO AHORRO DE CRÉDITOS GROK ACTIVO ($0.00)
                </span>
                <h2 className="mt-1 text-lg font-extrabold text-white">
                  🧠 Motores de Inteligencia Artificial, Hardware y Créditos
                </h2>
                <p className="text-xs text-slate-400">
                  Controla qué motores de IA procesan tus videos, detección de momentos virales, cámaras y transcripción
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-[#FFD43B]">
                    Cerebro Principal para Detectar Momentos Virales y Hooks
                  </label>
                  <select
                    value={primaryBrain}
                    onChange={(e) => setPrimaryBrain(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-[#111318] p-3 text-xs font-bold text-white"
                  >
                    <option value="CLAUDE_5_5_AND_NIM_FREE">
                      ✅ Claude 5.5 Haiku + NVIDIA NIM Gratis ($0.00 Créditos Grok)
                    </option>
                    <option value="NIM_FREE_ONLY">⚡ Solo NVIDIA NIM + Audio RMS Local (100% Gratis)</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-emerald-400">
                    Perfil de Hardware del Servidor (NVIDIA T400 4GB + i5-12500)
                  </label>
                  <select
                    value={hardwareProfile}
                    onChange={(e) => setHardwareProfile(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-[#111318] p-3 text-xs font-bold text-white"
                  >
                    <option value="NVIDIA_LOW_VRAM">NVIDIA_LOW_VRAM (Óptimo para T400 4GB VRAM • INT8)</option>
                    <option value="CPU_ONLY">CPU_ONLY (12 Hilos Intel Core i5-12500)</option>
                    <option value="NVIDIA_HIGH_VRAM">NVIDIA_HIGH_VRAM (12GB+ VRAM)</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-300">
                    Modelo Local de Voz a Texto (Faster-Whisper ASR)
                  </label>
                  <select
                    value={whisperModel}
                    onChange={(e) => setWhisperModel(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-[#111318] p-3 text-xs font-bold text-white"
                  >
                    <option value="base">base (Rápido y Preciso • Pre-instalado en Docker)</option>
                    <option value="small">small (Alta Precisión en Español/Inglés)</option>
                    <option value="tiny">tiny (Ultra Rápido para Directos En Vivo)</option>
                  </select>
                </div>

                <div className="flex items-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-200">
                  <ShieldCheck className="mr-3 h-6 w-6 shrink-0 text-emerald-400" />
                  <div>
                    <div className="font-extrabold text-emerald-300">Protección de Créditos Grok Activada</div>
                    <div className="text-[11px]">
                      El clipeo automático, subtítulos, Story 60s y detección de cámara usan <strong>$0.00 de Grok</strong>.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 5. 24/7 AUTO-CHANNEL WATCHER */}
          {activeSection === 'CHANNEL_WATCHER' && (
            <div className="rounded-3xl border border-slate-800 bg-[#1B1E25] p-6 shadow-2xl space-y-5">
              <div className="border-b border-slate-800 pb-4">
                <h2 className="text-lg font-extrabold text-white">
                  📡 Vigilante Automático 24/7 de Canales (YouTube / Kick / Twitch)
                </h2>
                <p className="text-xs text-slate-400">
                  Monitorea tus canales favoritos y extrae automáticamente los mejores momentos cuando suben video o prenden directo
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                <div className="sm:col-span-5">
                  <label className="mb-1 block text-[11px] font-bold text-[#FFD43B]">
                    URL del Canal o Directo
                  </label>
                  <input
                    type="url"
                    value={newChannelUrl}
                    onChange={(e) => setNewChannelUrl(e.target.value)}
                    placeholder="https://www.youtube.com/@RDjavi/streams"
                    className="w-full rounded-xl border border-slate-700 bg-[#111318] p-2.5 text-xs text-white"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="mb-1 block text-[11px] font-semibold text-slate-300">Nombre</label>
                  <input
                    type="text"
                    value={newChannelName}
                    onChange={(e) => setNewChannelName(e.target.value)}
                    placeholder="Ej: RDjavi"
                    className="w-full rounded-xl border border-slate-700 bg-[#111318] p-2.5 text-xs text-white"
                  />
                </div>
                <div className="sm:col-span-4">
                  <label className="mb-1 block text-[11px] font-semibold text-slate-300">Modo de Pantalla</label>
                  <select
                    value={newChannelSplitMode}
                    onChange={(e) => setNewChannelSplitMode(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-[#111318] p-2.5 text-xs font-bold text-white"
                  >
                    <option value="NONE">✨ Auto IA</option>
                    <option value="STREAMER_FACECAM_SPLIT">📹 Split 9:16 Streamer</option>
                    <option value="WIDE_ACTION_BLUR">🏟️ Deportes Blur</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleAddWatchedChannel}
                  className="flex items-center gap-1.5 rounded-xl bg-[#FFD43B] px-4 py-2 text-xs font-black text-[#111318]"
                >
                  <PlusCircle className="h-4 w-4" /> Agregar Canal al Vigilante 24/7
                </button>
                <button
                  type="button"
                  disabled={scanningWatcher || watchedChannels.length === 0}
                  onClick={() => handleScanWatcherNow()}
                  className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-2 text-xs font-bold text-emerald-300 disabled:opacity-40"
                >
                  {scanningWatcher ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                  <span>Escanear y Clipear Canal Ahora</span>
                </button>
              </div>

              <div className="space-y-2 pt-2">
                {watchedChannels.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-xs text-slate-400">
                    No tienes canales monitoreados aún. Agrega arriba cualquier canal como <code>@RDjavi</code> o <code>@Alofokeradioshow</code>.
                  </div>
                ) : (
                  watchedChannels.map((ch) => (
                    <div
                      key={ch.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-[#111318] p-3 text-xs"
                    >
                      <div>
                        <div className="font-bold text-white">{ch.channelName}</div>
                        <div className="text-[11px] text-slate-400">{ch.channelUrl}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleScanWatcherNow(ch.id)}
                          className="rounded-lg bg-[#FFD43B] px-3 py-1.5 text-[11px] font-black text-[#111318]"
                        >
                          ⚡ Escanear Ahora
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteWatchedChannel(ch.id)}
                          className="rounded-lg border border-red-500/40 bg-red-500/15 p-1.5 text-red-400 hover:bg-red-500/30"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* 6. STORAGE & CLEANUP */}
          {activeSection === 'STORAGE_CLEANUP' && (
            <div className="rounded-3xl border border-slate-800 bg-[#1B1E25] p-6 shadow-2xl space-y-5">
              <div className="border-b border-slate-800 pb-4">
                <h2 className="text-lg font-extrabold text-white">
                  💾 Almacenamiento Persistente (<code>/data</code>) y Limpieza
                </h2>
                <p className="text-xs text-slate-400">
                  Tus videos y clips están montados en el volumen persistente de Coolify para no perderse al actualizar
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-800 bg-[#111318] p-4">
                  <div className="text-xs text-slate-400">Espacio en Disco Usado</div>
                  <div className="mt-1 text-2xl font-black text-[#FFD43B]">
                    {formatBytes(storageStats.storageBytesUsed)}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-[#111318] p-4">
                  <div className="text-xs text-slate-400">Shorts / Clips Guardados</div>
                  <div className="mt-1 text-2xl font-black text-white">{storageStats.clipsCount}</div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-[#111318] p-4">
                  <div className="text-xs text-slate-400">Videos Originales</div>
                  <div className="mt-1 text-2xl font-black text-white">{storageStats.videosCount}</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-[#111318] p-4 text-xs">
                <div>
                  <div className="font-bold text-white">Liberar espacio eliminando videos o clips que no te gusten</div>
                  <div className="text-[11px] text-slate-400">
                    Desde Mi Biblioteca o AI Clipping puedes borrar cualquier clip o video original con el botón rojo Eliminar.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => router.push('/library')}
                  className="rounded-xl bg-[#FFD43B] px-4 py-2 font-black text-[#111318]"
                >
                  Ir a Mi Biblioteca →
                </button>
              </div>
            </div>
          )}

          {/* 7. SECURITY & ACCOUNT PASSWORD */}
          {activeSection === 'SECURITY' && (
            <div className="space-y-6">
              <div className="rounded-3xl border border-slate-800 bg-[#1B1E25] p-6 shadow-2xl space-y-4">
                <h2 className="flex items-center gap-2 text-base font-extrabold text-white">
                  <User className="h-4 w-4 text-[#FFD43B]" /> Datos de Perfil
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-[#94A3B8]">Nombre para Mostrar</label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-700 bg-[#111318] p-2.5 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#94A3B8]">Correo Electrónico</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-700 bg-[#111318] p-2.5 text-sm text-white"
                    />
                  </div>
                </div>
              </div>

              <form
                onSubmit={handlePasswordChange}
                className="space-y-4 rounded-3xl border border-slate-800 bg-[#1B1E25] p-6 shadow-2xl"
              >
                <h2 className="flex items-center gap-2 text-base font-extrabold text-[#FFD43B]">
                  <Lock className="h-4 w-4" /> Cambiar Contraseña de Acceso (Argon2id)
                </h2>
                <div>
                  <label className="block text-xs font-semibold text-[#94A3B8]">Contraseña Actual</label>
                  <input
                    type="password"
                    value={currentPassword}
                    data-testid="input-current-password"
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-[#111318] p-2.5 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#94A3B8]">
                    Nueva Contraseña Segura (Mínimo 8 caracteres)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    data-testid="input-new-password"
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-[#111318] p-2.5 text-sm text-white"
                  />
                </div>
                <button
                  type="submit"
                  data-testid="btn-save-password"
                  className="rounded-xl bg-[#FFD43B] px-6 py-2.5 text-xs font-black text-[#111318]"
                >
                  Actualizar Contraseña
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
