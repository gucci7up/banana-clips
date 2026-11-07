'use client';

import React, { useState } from 'react';
import { apiFetch, useStudioStore } from './store';
import { Upload, Sparkles, CheckCircle2, Film, ArrowRight, X, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function CreateClipsWizardModal() {
  const { wizardOpen, setWizardOpen } = useStudioStore();
  const router = useRouter();

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [sourceMode, setSourceMode] = useState<'UPLOAD' | 'URL'>('UPLOAD');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [title, setTitle] = useState('');
  const [targetDurationSec, setTargetDurationSec] = useState<number>(30);
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9' | '1:1' | '4:5'>('9:16');
  const [gameId, setGameId] = useState('fortnite');
  const [progressPhase, setProgressPhase] = useState('Iniciando...');
  const [progressPercent, setProgressPercent] = useState(0);
  const [generatedClips, setGeneratedClips] = useState<any[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  if (!wizardOpen) return null;

  const handleRunWizardPipeline = async () => {
    setErrorMsg(null);
    setIsBusy(true);
    setStep(4);
    setProgressPhase('Importando video y verificando con FFprobe...');
    setProgressPercent(15);

    try {
      let videoId = '';
      if (sourceMode === 'UPLOAD') {
        if (!selectedFile) {
          throw new Error('Selecciona un archivo MP4, MOV, MKV o WEBM.');
        }
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('title', title || selectedFile.name);
        const upRes = await apiFetch<{ video: { id: string } }>('/uploads/video', {
          method: 'POST',
          body: formData,
        });
        videoId = upRes.video.id;
      } else {
        const urlRes = await apiFetch<{ video: { id: string } }>('/uploads/from-url', {
          method: 'POST',
          body: JSON.stringify({ url: videoUrl, title: title || 'Video desde URL' }),
        });
        videoId = urlRes.video.id;
      }

      setProgressPhase('Transcribiendo, detectando escenas y generando clips con IA...');
      setProgressPercent(55);

      const jobRes = await apiFetch<{ jobId: string }>('/jobs', {
        method: 'POST',
        body: JSON.stringify({
          videoId,
          jobType: 'AI_CLIPPING',
          targetDurationSec,
          aspectRatio,
          gameId,
          syncExecution: true,
        }),
      });

      const detail = await apiFetch<{ job: any; clips: any[] }>(`/jobs/${jobRes.jobId}`);
      setProgressPercent(100);
      setProgressPhase('Completado');
      setGeneratedClips(detail.clips || []);
      setStep(5);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al procesar el video.');
      setStep(2);
    } finally {
      setIsBusy(false);
    }
  };

  const resetAndClose = () => {
    setStep(1);
    setGeneratedClips([]);
    setErrorMsg(null);
    setWizardOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-[#1B1E25] p-6 text-[#F8FAFC] shadow-2xl">
        <div className="mb-6 flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFD43B] text-[#111318]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Asistente: Crear clips con IA</h2>
              <p className="text-xs text-[#94A3B8]">Paso {step} de 5 — Pipeline Multimodal Local</p>
            </div>
          </div>
          <button
            onClick={resetAndClose}
            className="rounded-lg p-1.5 text-[#94A3B8] hover:bg-slate-800 hover:text-white"
            aria-label="Cerrar asistente"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
            {errorMsg}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold">Paso 1: Seleccionar fuente de contenido</h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSourceMode('UPLOAD')}
                className={`rounded-xl border p-4 text-left transition ${
                  sourceMode === 'UPLOAD'
                    ? 'border-[#FFD43B] bg-[#FFD43B]/10'
                    : 'border-slate-800 bg-[#111318]'
                }`}
              >
                <Upload className="mb-2 h-5 w-5 text-[#FFD43B]" />
                <div className="font-semibold">Subir Archivo Local</div>
                <div className="text-xs text-[#94A3B8]">MP4, MOV, MKV o WEBM verificado con FFprobe</div>
              </button>
              <button
                type="button"
                onClick={() => setSourceMode('URL')}
                className={`rounded-xl border p-4 text-left transition ${
                  sourceMode === 'URL'
                    ? 'border-[#FFD43B] bg-[#FFD43B]/10'
                    : 'border-slate-800 bg-[#111318]'
                }`}
              >
                <Film className="mb-2 h-5 w-5 text-[#FFB703]" />
                <div className="font-semibold">Importar desde URL</div>
                <div className="text-xs text-[#94A3B8]">Fuentes compatibles autorizadas con protección SSRF</div>
              </button>
            </div>

            {sourceMode === 'UPLOAD' ? (
              <div className="space-y-2">
                <label className="block text-xs font-medium text-[#94A3B8]">Archivo de video</label>
                <input
                  type="file"
                  accept=".mp4,.mov,.mkv,.webm,video/*"
                  data-testid="wizard-file-input"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setSelectedFile(f);
                    if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ''));
                  }}
                  className="w-full rounded-xl border border-slate-700 bg-[#111318] p-2.5 text-sm"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <label className="block text-xs font-medium text-[#94A3B8]">URL del video</label>
                <input
                  type="url"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://ejemplo.com/charla-podcast.mp4"
                  className="w-full rounded-xl border border-slate-700 bg-[#111318] p-2.5 text-sm"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[#94A3B8]">Título del proyecto / video</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej. Podcast Episodio #42 - Inteligencia Artificial"
                className="mt-1 w-full rounded-xl border border-slate-700 bg-[#111318] p-2.5 text-sm"
              />
            </div>

            <div className="flex justify-end pt-3">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex items-center gap-2 rounded-xl bg-[#FFD43B] px-5 py-2.5 text-sm font-bold text-[#111318] hover:bg-[#FFB703]"
              >
                Siguiente: Configurar Análisis <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold">Paso 2: Configurar parámetros de IA y encuadre</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#94A3B8]">Duración objetivo por clip</label>
                <select
                  value={targetDurationSec}
                  onChange={(e) => setTargetDurationSec(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-[#111318] p-2.5 text-sm"
                >
                  <option value={15}>15 segundos (Shorts / Reels)</option>
                  <option value={30}>30 segundos</option>
                  <option value={45}>45 segundos</option>
                  <option value={60}>60 segundos</option>
                  <option value={90}>90 segundos</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#94A3B8]">Relación de aspecto (Auto Reframe)</label>
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value as any)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-[#111318] p-2.5 text-sm"
                >
                  <option value="9:16">9:16 Vertical (TikTok / Reels / Shorts)</option>
                  <option value="1:1">1:1 Cuadrado</option>
                  <option value="4:5">4:5 Retrato Feed</option>
                  <option value="16:9">16:9 Horizontal Original</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#94A3B8]">Perfil de detector multimodal</label>
              <select
                value={gameId}
                onChange={(e) => setGameId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-[#111318] p-2.5 text-sm"
              >
                <option value="generic">General / Podcast / Entrevistas</option>
                <option value="fortnite">Gaming: Fortnite</option>
                <option value="gtav">Gaming: GTA V / VI</option>
                <option value="valorant">Gaming: Valorant</option>
                <option value="cod">Gaming: Call of Duty</option>
              </select>
            </div>

            <div className="flex justify-between pt-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-[#94A3B8] hover:text-white"
              >
                Atrás
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="flex items-center gap-2 rounded-xl bg-[#FFD43B] px-5 py-2.5 text-sm font-bold text-[#111318]"
              >
                Continuar a Confirmación <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold">Paso 3: Confirmar procesamiento con IA</h3>
            <div className="rounded-xl border border-slate-800 bg-[#111318] p-4 text-sm space-y-2">
              <div><span className="text-[#94A3B8]">Fuente:</span> {sourceMode === 'UPLOAD' ? selectedFile?.name || 'Archivo local' : videoUrl}</div>
              <div><span className="text-[#94A3B8]">Duración objetivo:</span> {targetDurationSec} segundos</div>
              <div><span className="text-[#94A3B8]">Encuadre IA:</span> {aspectRatio} (Seguimiento visual inteligente)</div>
              <div><span className="text-[#94A3B8]">Pipeline:</span> 20 etapas (FFprobe, Faster-Whisper, PySceneDetect, pgvector, FFmpeg H.264)</div>
            </div>
            <div className="flex justify-between pt-3">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-[#94A3B8]"
              >
                Modificar
              </button>
              <button
                type="button"
                data-testid="wizard-confirm-run"
                onClick={handleRunWizardPipeline}
                className="flex items-center gap-2 rounded-xl bg-[#FFD43B] px-6 py-2.5 text-sm font-bold text-[#111318] hover:bg-[#FFB703]"
              >
                <Sparkles className="h-4 w-4" /> Iniciar Procesamiento Real
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="py-8 text-center space-y-4">
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-[#FFD43B]" />
            <h3 className="text-base font-bold">{progressPhase}</h3>
            <div className="mx-auto h-3 w-full max-w-md overflow-hidden rounded-full bg-[#111318]">
              <div
                className="h-full bg-[#FFD43B] transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="text-xs text-[#94A3B8]">Progreso reportado por los workers: {progressPercent}%</p>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
              <h3 className="text-base font-bold">
                Paso 5: ¡Procesamiento completado! ({generatedClips.length} clips MP4 creados)
              </h3>
            </div>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {generatedClips.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-xl border border-slate-800 bg-[#111318] p-3"
                >
                  <div>
                    <div className="font-semibold text-sm">{c.title}</div>
                    <div className="text-xs text-[#94A3B8]">
                      Duración: {c.durationSec}s • Formato: {c.aspectRatio} • Score Calidad: {c.scoreTotal}/100
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      resetAndClose();
                      router.push('/editor?clipId=' + c.id);
                    }}
                    className="rounded-lg bg-[#FFD43B] px-3 py-1.5 text-xs font-bold text-[#111318]"
                  >
                    Abrir en Editor
                  </button>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  resetAndClose();
                  router.push('/library');
                }}
                className="rounded-xl bg-[#FFD43B] px-5 py-2 text-sm font-bold text-[#111318]"
              >
                Ver en Mi Biblioteca
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
