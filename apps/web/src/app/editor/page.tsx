'use client';

import React, { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/store';
import { SUBTITLE_TEMPLATES } from '@banana/shared';
import type { SubtitleTemplateName } from '@banana/video-types';
import {
  Play,
  Pause,
  Scissors,
  Undo2,
  Redo2,
  Save,
  Download,
  Volume2,
  VolumeX,
  Type,
  Maximize2,
  Sparkles,
  Trash2,
} from 'lucide-react';

export default function VideoEditorPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [clips, setClips] = useState<any[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string>('');
  const [clipDetail, setClipDetail] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  // Non-destructive editor state
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9' | '1:1' | '4:5'>('9:16');
  const [reframeMode, setReframeMode] = useState<string>('LEVEL_2_VISUAL_TRACKING');
  const [subtitleTemplate, setSubtitleTemplate] = useState<SubtitleTemplateName>('Bold');
  const [speed, setSpeed] = useState<number>(1.0);
  const [volume, setVolume] = useState<number>(1.0);
  const [muted, setMuted] = useState<boolean>(false);
  const [overlayText, setOverlayText] = useState<string>('');
  const [deletedWords, setDeletedWords] = useState<number[]>([]);
  const [historyStack, setHistoryStack] = useState<any[]>([]);
  const [redoStack, setRedoStack] = useState<any[]>([]);

  // Export state
  const [exportPreset, setExportPreset] = useState('TikTok');
  const [exportResolution, setExportResolution] = useState('1080p');
  const [exportResult, setExportResult] = useState<any>(null);
  const [busyExport, setBusyExport] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Claude 5.5 Vision AI Video Editor & Active Speaker Tracker state
  const [claudeInstruction, setClaudeInstruction] = useState('');
  const [twoSpeakerSplit, setTwoSpeakerSplit] = useState(false);
  const [busyClaudeEdit, setBusyClaudeEdit] = useState(false);
  const [claudeEditReport, setClaudeEditReport] = useState<any>(null);

  const handleClaudeVisionEdit = async () => {
    if (!selectedClipId) return;
    setBusyClaudeEdit(true);
    setClaudeEditReport(null);
    setSaveMessage('🧠 Claude 5.5 Vision analizando fotogramas del hablante y re-renderizando con FFmpeg...');
    try {
      const res = await apiFetch<{
        ok: boolean;
        plan: any;
        signedDownloadUrl: string | null;
        message: string;
      }>(`/clips/${selectedClipId}/claude-edit`, {
        method: 'POST',
        body: JSON.stringify({
          instruction: claudeInstruction,
          twoSpeakerSplit,
        }),
      });
      setClaudeEditReport(res.plan);
      setSaveMessage(res.message);
      if (res.signedDownloadUrl) {
        setClipDetail((prev: any) =>
          prev ? { ...prev, signedDownloadUrl: res.signedDownloadUrl } : prev
        );
      }
    } catch (err: any) {
      setSaveMessage(`⚠️ ${err?.message || 'Error al editar el video con Claude 5.5 Vision'}`);
    } finally {
      setBusyClaudeEdit(false);
    }
  };

  useEffect(() => {
    apiFetch<{ clips: any[] }>('/clips').then((res) => {
      const list = res.clips || [];
      setClips(list);
      const urlParams = new URLSearchParams(window.location.search);
      const qClipId = urlParams.get('clipId');
      const initialId = qClipId || list[0]?.id || '';
      if (initialId) {
        setSelectedClipId(initialId);
      }
    });
  }, []);

  useEffect(() => {
    if (!selectedClipId) return;
    apiFetch<{ clip: any }>(`/clips/${selectedClipId}`).then((res) => {
      setClipDetail(res.clip);
      setAspectRatio((res.clip.aspectRatio as any) || '9:16');
    });
  }, [selectedClipId]);

  const pushUndoSnapshot = () => {
    setHistoryStack((prev) => [
      ...prev,
      { aspectRatio, reframeMode, subtitleTemplate, speed, volume, muted, overlayText, deletedWords },
    ]);
    setRedoStack([]);
  };

  const handleUndo = () => {
    if (historyStack.length === 0) return;
    const prev = historyStack[historyStack.length - 1];
    setRedoStack((r) => [
      ...r,
      { aspectRatio, reframeMode, subtitleTemplate, speed, volume, muted, overlayText, deletedWords },
    ]);
    setHistoryStack((h) => h.slice(0, -1));
    setAspectRatio(prev.aspectRatio);
    setReframeMode(prev.reframeMode);
    setSubtitleTemplate(prev.subtitleTemplate);
    setSpeed(prev.speed);
    setVolume(prev.volume);
    setMuted(prev.muted);
    setOverlayText(prev.overlayText);
    setDeletedWords(prev.deletedWords);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setHistoryStack((h) => [
      ...h,
      { aspectRatio, reframeMode, subtitleTemplate, speed, volume, muted, overlayText, deletedWords },
    ]);
    setRedoStack((r) => r.slice(0, -1));
    setAspectRatio(next.aspectRatio);
    setReframeMode(next.reframeMode);
    setSubtitleTemplate(next.subtitleTemplate);
    setSpeed(next.speed);
    setVolume(next.volume);
    setMuted(next.muted);
    setOverlayText(next.overlayText);
    setDeletedWords(next.deletedWords);
  };

  const handleSaveNonDestructiveEdit = async () => {
    if (!selectedClipId) return;
    const stateJson = {
      version: historyStack.length + 2,
      aspectRatio,
      reframeMode,
      subtitleStyle: SUBTITLE_TEMPLATES[subtitleTemplate],
      speed,
      volume,
      muted,
      overlayText,
      deletedWords,
    };
    const res = await apiFetch<{ version: number }>(`/clips/${selectedClipId}/editor`, {
      method: 'PUT',
      body: JSON.stringify({
        stateJson,
        operationType: 'SAVE_TIMELINE_AND_TEXT_EDIT',
        payloadJson: { subtitleTemplate, aspectRatio, deletedWordsCount: deletedWords.length },
      }),
    });
    setSaveMessage(`Guardado en PostgreSQL (Versión no destructiva v${res.version})`);
    setTimeout(() => setSaveMessage(null), 3500);
  };

  const handleServerRenderExport = async () => {
    if (!selectedClipId) return;
    setBusyExport(true);
    setExportResult(null);
    try {
      const res = await apiFetch<{ export: any }>('/exports', {
        method: 'POST',
        body: JSON.stringify({
          clipId: selectedClipId,
          preset: exportPreset,
          resolution: exportResolution,
          aspectRatio,
          burnSubtitles: true,
          speed,
          volume,
          muted,
        }),
      });
      setExportResult(res.export);
    } finally {
      setBusyExport(false);
    }
  };

  const words: any[] = React.useMemo(() => {
    const raw = clipDetail?.transcript?.wordsJson;
    if (!raw) return [];
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  }, [clipDetail]);

  const activeStyle = SUBTITLE_TEMPLATES[subtitleTemplate];

  return (
    <div className="space-y-6">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#F8FAFC]">
            Editor de Video No Destructivo & Text-Based Editing
          </h1>
          <p className="text-xs text-[#94A3B8]">
            Timeline multicapa, edición desde transcripción, Auto-Reframe inteligente, 9 plantillas de subtítulos ASS y renderizado en servidor FFmpeg
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedClipId}
            onChange={(e) => setSelectedClipId(e.target.value)}
            className="rounded-xl border border-slate-700 bg-[#1B1E25] px-3 py-2 text-xs font-semibold"
          >
            {clips.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} ({c.durationSec}s)
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleUndo}
            disabled={historyStack.length === 0}
            className="rounded-xl border border-slate-700 bg-[#1B1E25] p-2 text-xs disabled:opacity-40"
            title="Deshacer"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            className="rounded-xl border border-slate-700 bg-[#1B1E25] p-2 text-xs disabled:opacity-40"
            title="Rehacer"
          >
            <Redo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            data-testid="editor-save-btn"
            onClick={handleSaveNonDestructiveEdit}
            className="flex items-center gap-1.5 rounded-xl border border-[#FFD43B] bg-[#FFD43B]/15 px-4 py-2 text-xs font-bold text-[#FFD43B]"
          >
            <Save className="h-4 w-4" /> Guardar Cambios
          </button>
          <button
            type="button"
            data-testid="editor-export-btn"
            disabled={busyExport}
            onClick={handleServerRenderExport}
            className="flex items-center gap-1.5 rounded-xl bg-[#FFD43B] px-4 py-2 text-xs font-bold text-[#111318]"
          >
            <Download className="h-4 w-4" />
            {busyExport ? 'Renderizando con FFmpeg...' : 'Exportar MP4 Final'}
          </button>
        </div>
      </div>

      {saveMessage && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs font-semibold text-emerald-300">
          {saveMessage}
        </div>
      )}

      {/* Claude 5.5 Vision AI Video Editor & Active Speaker Lock Bar */}
      <div className="rounded-2xl border border-[#FFD43B]/40 bg-gradient-to-r from-[#171A24] via-[#131720] to-[#1E1910] p-4 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#FFD43B]/20 px-2.5 py-0.5 text-[11px] font-black text-[#FFD43B] border border-[#FFD43B]/40">
              <Sparkles className="h-3 w-3" /> Claude 5.5 Vision + Active Speaker Lock
            </span>
            <span className="text-xs font-bold text-white">
              Copiloto de Edición IA & Detección Real de Persona Hablando (Sin Oscilación Lateral)
            </span>
          </div>
          <label className="flex items-center gap-1.5 text-xs font-bold text-amber-300 cursor-pointer">
            <input
              type="checkbox"
              checked={twoSpeakerSplit}
              onChange={(e) => setTwoSpeakerSplit(e.target.checked)}
              className="rounded border-slate-700"
            />
            👥 Modo 2 Hablantes (Split Arriba / Abajo)
          </label>
        </div>

        <div className="flex flex-col gap-2.5 sm:flex-row">
          <input
            type="text"
            value={claudeInstruction}
            onChange={(e) => setClaudeInstruction(e.target.value)}
            placeholder="Opcional: Escribe qué quieres hacerle al clip (ej: 'Centra al entrevistado de la derecha, pon música Phonk y zoom dinámico')..."
            className="flex-1 rounded-xl border border-slate-700 bg-[#0B0D12] px-3.5 py-2.5 text-xs text-white focus:border-[#FFD43B] focus:outline-none"
          />
          <button
            type="button"
            disabled={busyClaudeEdit || !selectedClipId}
            onClick={handleClaudeVisionEdit}
            className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#FFD43B] to-[#FFB703] px-5 py-2.5 text-xs font-black text-[#0B0D12] shadow hover:brightness-105 disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            {busyClaudeEdit
              ? '⏳ Claude 5.5 Analizando Rostros y Editando...'
              : '🪄 Auto-Editar y Centrar Hablante (Claude 5.5)'}
          </button>
        </div>

        {claudeEditReport && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-[#0B0D12]/90 p-2.5 text-[11px] text-slate-200">
            <span className="rounded bg-emerald-500/20 px-2 py-0.5 font-bold text-emerald-300">
              🎯 Hablante X1={Math.round((claudeEditReport.firstHalfX ?? 0.5) * 100)}% / X2={Math.round((claudeEditReport.secondHalfX ?? 0.5) * 100)}%
            </span>
            {claudeEditReport.hookBannerText && (
              <span className="rounded bg-[#FFD43B]/20 px-2 py-0.5 font-bold text-[#FFD43B]">
                🔥 Hook: {claudeEditReport.hookBannerText}
              </span>
            )}
            <span className="rounded bg-purple-500/20 px-2 py-0.5 font-bold text-purple-300">
              🎨 Efecto: {claudeEditReport.videoEffect}
            </span>
            {claudeEditReport.backgroundMusicTrack && claudeEditReport.backgroundMusicTrack !== 'NONE' && (
              <span className="rounded bg-sky-500/20 px-2 py-0.5 font-bold text-sky-300">
                🎵 BGM: {claudeEditReport.backgroundMusicTrack}
              </span>
            )}
            <span className="text-slate-400">{claudeEditReport.explanationEs}</span>
          </div>
        )}
      </div>

      {exportResult && (
        <div
          data-testid="export-completed-banner"
          className="flex items-center justify-between rounded-xl border border-[#FFD43B] bg-[#FFD43B]/15 p-4 text-xs"
        >
          <div>
            <div className="font-bold text-sm text-[#FFD43B]">
              ¡Exportación FFmpeg H.264 + AAC completada!
            </div>
            <div className="text-[#F8FAFC]">
              Preset: {exportResult.preset} • Resolución: {exportResult.resolution} ({exportResult.metadata?.width}x{exportResult.metadata?.height}) • Duración: {exportResult.metadata?.durationSeconds}s
            </div>
          </div>
          <a
            href={exportResult.downloadUrl}
            download={`export_${exportResult.id}.mp4`}
            data-testid="export-download-btn"
            className="rounded-xl bg-[#FFD43B] px-4 py-2 font-bold text-[#111318]"
          >
            Descargar Archivo MP4
          </a>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Column 1: Text-Based Transcript Editing */}
        <div className="rounded-2xl border border-slate-800 bg-[#1B1E25] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#FFD43B]">
              Text-Based Editing (Edición por Transcripción)
            </h2>
            <button
              type="button"
              onClick={() => {
                pushUndoSnapshot();
                setDeletedWords([]);
              }}
              className="text-[11px] text-[#94A3B8] hover:text-white"
            >
              Restaurar palabras
            </button>
          </div>
          <p className="text-xs text-[#94A3B8]">
            Haz clic en una palabra para saltar a ese segundo en el video, o haz doble clic para eliminarla sin modificar destructivamente el archivo original.
          </p>

          <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-800 bg-[#111318] p-3 leading-relaxed">
            {words.length === 0 ? (
              <span className="text-xs text-[#94A3B8]">Selecciona un clip para editar su transcripción sincronizada.</span>
            ) : (
              words.map((w, idx) => {
                const isDeleted = deletedWords.includes(idx);
                const isActive = currentTime >= w.start && currentTime <= w.end;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      if (videoRef.current) {
                        videoRef.current.currentTime = w.start;
                        setCurrentTime(w.start);
                      }
                    }}
                    onDoubleClick={() => {
                      pushUndoSnapshot();
                      setDeletedWords((prev) =>
                        prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
                      );
                    }}
                    className={`mr-1.5 mb-1.5 inline-block rounded px-1.5 py-0.5 text-xs transition ${
                      isDeleted
                        ? 'bg-red-500/20 text-red-400 line-through opacity-50'
                        : isActive
                        ? 'bg-[#FFD43B] font-bold text-[#111318]'
                        : 'bg-slate-800/70 text-[#F8FAFC] hover:bg-slate-700'
                    }`}
                  >
                    {w.word}
                  </button>
                );
              })
            )}
          </div>

          <div className="flex gap-2 pt-2">
            {clipDetail?.transcript?.srtContent && (
              <a
                href={`data:text/plain;charset=utf-8,${encodeURIComponent(clipDetail.transcript.srtContent)}`}
                download="subtitulos.srt"
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold hover:border-[#FFD43B]"
              >
                Exportar .SRT
              </a>
            )}
            {clipDetail?.transcript?.vttContent && (
              <a
                href={`data:text/vtt;charset=utf-8,${encodeURIComponent(clipDetail.transcript.vttContent)}`}
                download="subtitulos.vtt"
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold hover:border-[#FFD43B]"
              >
                Exportar .VTT
              </a>
            )}
          </div>
        </div>

        {/* Column 2: Custom HTML5 Video Preview + Realistic Animated Subtitles Preview */}
        <div className="flex flex-col items-center justify-between rounded-2xl border border-slate-800 bg-[#1B1E25] p-5">
          <div className="relative flex w-full items-center justify-center overflow-hidden rounded-xl bg-black py-4">
            {clipDetail?.signedDownloadUrl ? (
              <video
                ref={videoRef}
                src={clipDetail.signedDownloadUrl}
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                className="max-h-80 rounded-lg object-contain"
                controls
              />
            ) : (
              <div className="py-20 text-xs text-[#94A3B8]">Sin vista previa cargada</div>
            )}

            {/* Realistic Live Subtitle Style Overlay */}
            <div
              className="pointer-events-none absolute bottom-10 left-4 right-4 text-center"
              style={{
                fontFamily: activeStyle.fontFamily,
                color: activeStyle.primaryColor,
                textShadow: `0px 2px ${activeStyle.outlineWidth}px ${activeStyle.outlineColor}`,
              }}
            >
              <span
                className="inline-block rounded px-3 py-1 font-extrabold text-sm"
                style={{
                  backgroundColor: activeStyle.backgroundBox ? activeStyle.backgroundColor : 'transparent',
                }}
              >
                {overlayText ||
                  words
                    .filter((_, idx) => !deletedWords.includes(idx))
                    .slice(0, 5)
                    .map((w) => w.word)
                    .join(' ') ||
                  'Previsualización de Subtítulos Dinámicos'}
              </span>
            </div>
          </div>

          {/* Custom Playback Controls */}
          <div className="mt-4 flex w-full items-center justify-between gap-3 rounded-xl bg-[#111318] p-3 text-xs">
            <button
              type="button"
              onClick={() => {
                if (!videoRef.current) return;
                if (videoRef.current.paused) videoRef.current.play();
                else videoRef.current.pause();
              }}
              className="flex items-center gap-1 rounded-lg bg-[#FFD43B] px-3 py-1.5 font-bold text-[#111318]"
            >
              {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {isPlaying ? 'Pausar' : 'Reproducir'}
            </button>
            <span className="font-mono text-[#94A3B8]">
              {currentTime.toFixed(1)}s / {clipDetail?.durationSec || 0}s
            </span>
            <button
              type="button"
              onClick={() => {
                pushUndoSnapshot();
                setMuted(!muted);
              }}
              className="rounded-lg border border-slate-700 p-1.5"
            >
              {muted ? <VolumeX className="h-4 w-4 text-red-400" /> : <Volume2 className="h-4 w-4 text-[#FFD43B]" />}
            </button>
          </div>
        </div>

        {/* Column 3: Subtitles Templates, Auto-Reframe & Export Settings */}
        <div className="space-y-4 rounded-2xl border border-slate-800 bg-[#1B1E25] p-5">
          <h2 className="text-sm font-bold text-[#FFD43B]">
            Plantillas de Subtítulos, Auto-Reframe y Exportación
          </h2>

          <div>
            <label className="block text-xs font-semibold text-[#94A3B8]">
              Plantilla de Subtítulos (9 estilos profesionales)
            </label>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              {(Object.keys(SUBTITLE_TEMPLATES) as SubtitleTemplateName[]).map((tpl) => (
                <button
                  key={tpl}
                  type="button"
                  onClick={() => {
                    pushUndoSnapshot();
                    setSubtitleTemplate(tpl);
                  }}
                  className={`rounded-lg border py-1.5 text-xs font-bold ${
                    subtitleTemplate === tpl
                      ? 'border-[#FFD43B] bg-[#FFD43B] text-[#111318]'
                      : 'border-slate-800 bg-[#111318] text-[#94A3B8]'
                  }`}
                >
                  {tpl}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#94A3B8]">Auto-Reframe Formato</label>
              <select
                value={aspectRatio}
                onChange={(e) => {
                  pushUndoSnapshot();
                  setAspectRatio(e.target.value as any);
                }}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-[#111318] p-2 text-xs"
              >
                <option value="9:16">9:16 Vertical</option>
                <option value="1:1">1:1 Cuadrado</option>
                <option value="4:5">4:5 Retrato</option>
                <option value="16:9">16:9 Horizontal</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#94A3B8]">Nivel de Encuadre IA</label>
              <select
                value={reframeMode}
                onChange={(e) => {
                  pushUndoSnapshot();
                  setReframeMode(e.target.value);
                }}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-[#111318] p-2 text-xs"
              >
                <option value="LEVEL_1_CENTER_CROP">Nivel 1: Crop Central</option>
                <option value="LEVEL_2_VISUAL_TRACKING">Nivel 2: Seguimiento Sujeto</option>
                <option value="LEVEL_3_SMART_SPLIT_COMPOSITION">Nivel 3: Split Screen (2 Hablantes / Webcam)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#94A3B8]">Velocidad ({speed}x)</label>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.1}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="mt-1 w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#94A3B8]">Volumen ({Math.round(volume * 100)}%)</label>
              <input
                type="range"
                min={0}
                max={2.0}
                step={0.1}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="mt-1 w-full"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#94A3B8]">
              Texto superpuesto / Marca de Agua
            </label>
            <input
              type="text"
              value={overlayText}
              onChange={(e) => setOverlayText(e.target.value)}
              placeholder="Título o llamada a la acción en pantalla..."
              className="mt-1 w-full rounded-xl border border-slate-700 bg-[#111318] p-2 text-xs"
            />
          </div>

          <div className="border-t border-slate-800 pt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#94A3B8]">Preset de Exportación</label>
              <select
                value={exportPreset}
                onChange={(e) => setExportPreset(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-[#111318] p-2 text-xs"
              >
                <option value="TikTok">TikTok (9:16 H.264)</option>
                <option value="Instagram Reels">Instagram Reels</option>
                <option value="YouTube Shorts">YouTube Shorts</option>
                <option value="Facebook Reels">Facebook Reels</option>
                <option value="YouTube Landscape">YouTube Landscape (16:9)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#94A3B8]">Resolución</label>
              <select
                value={exportResolution}
                onChange={(e) => setExportResolution(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-[#111318] p-2 text-xs"
              >
                <option value="720p">720p HD</option>
                <option value="1080p">1080p Full HD</option>
                <option value="1440p">1440p QHD</option>
                <option value="4K">4K UHD</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
