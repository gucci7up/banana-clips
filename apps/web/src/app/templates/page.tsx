'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/store';
import { Sparkles, Palette, Type, Zap, ArrowUpRight } from 'lucide-react';

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);

  useEffect(() => {
    apiFetch<{ templates: any[] }>('/templates').then((res) => setTemplates(res.templates || []));
  }, []);

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#FFD43B]/30 bg-[#FFD43B]/10 px-3 py-0.5 text-[11px] font-extrabold text-[#FFD43B]">
            <Palette className="h-3.5 w-3.5" /> Brand Kit & Estudio de Plantillas Visuales
          </div>
          <h1 className="mt-1.5 text-xl sm:text-2xl font-extrabold text-white">
            Plantillas de Subtítulos ASS, Auto Hooks y Brand Kit
          </h1>
          <p className="text-xs text-slate-400">
            Previsualiza los estilos tipográficos, colores activos de karaoke y animaciones antes de aplicarlos en AI Clipping
          </p>
        </div>

        <Link
          href="/ai-clipping"
          className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#FFD43B] to-[#FFB703] px-4 py-2 text-xs font-black text-[#0B0D12] shadow"
        >
          <Sparkles className="h-3.5 w-3.5" /> Usar Plantillas en AI Clipping
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((t) => {
          const cfg = typeof t.configJson === 'string' ? JSON.parse(t.configJson || '{}') : t.configJson || {};
          const primaryColor = cfg.primaryColor || '#FFFFFF';
          const activeColor = cfg.activeWordColor || '#FFD43B';
          const outlineColor = cfg.outlineColor || '#000000';

          return (
            <div key={t.id} className="studio-card studio-card-hover flex flex-col justify-between p-5 space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-base font-extrabold text-white">{t.name}</span>
                  <span className="rounded-full border border-[#FFD43B]/30 bg-[#FFD43B]/10 px-2.5 py-0.5 text-[10px] font-bold text-[#FFD43B]">
                    {t.category}
                  </span>
                </div>

                {/* Live Visual Preview Box */}
                <div className="relative flex h-32 flex-col items-center justify-center overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-[#0B0D12] to-slate-950 p-3">
                  <div className="mb-1.5 rounded bg-[#FFD43B] px-2 py-0.5 text-[8px] font-black uppercase text-black animate-hook-elastic">
                    ⚡ VIRAL HOOK
                  </div>
                  <div
                    className="text-center font-black tracking-wide leading-tight"
                    style={{
                      fontFamily: cfg.fontFamily || 'Inter, sans-serif',
                      fontSize: '18px',
                      color: primaryColor,
                      textShadow: `0 2px 6px ${outlineColor}`,
                    }}
                  >
                    CREA CLIPS{' '}
                    <span
                      style={{
                        color: activeColor,
                        textDecoration: 'underline',
                      }}
                    >
                      VIRALES
                    </span>{' '}
                    HOY
                  </div>
                  <span className="mt-2 text-[10px] text-slate-400">
                    Animación: <strong className="text-slate-200">{cfg.animation || 'pop'}</strong> • Fuente:{' '}
                    <strong className="text-slate-200">{cfg.fontFamily || 'Montserrat'}</strong>
                  </span>
                </div>

                {/* Color Swatches */}
                <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1">
                      <span className="h-3.5 w-3.5 rounded-full border border-white/20" style={{ backgroundColor: primaryColor }} />
                      Texto
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-3.5 w-3.5 rounded-full border border-white/20" style={{ backgroundColor: activeColor }} />
                      Palabra Activa
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-300">
                    {cfg.maxWordsPerLine || 4} palabras/línea
                  </span>
                </div>
              </div>

              <Link
                href="/ai-clipping"
                className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-[#0B0D12] py-2 text-xs font-bold text-slate-200 hover:border-[#FFD43B] hover:text-[#FFD43B] transition"
              >
                Aplicar estilo {t.name} <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
