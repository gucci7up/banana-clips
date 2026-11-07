'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/store';

export default function AnalyticsPage() {
  const [dash, setDash] = useState<any>(null);

  useEffect(() => {
    apiFetch('/dashboard').then(setDash);
  }, []);

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-800 pb-4">
        <h1 className="text-2xl font-extrabold text-[#F8FAFC]">Analíticas de Procesamiento y Calidad</h1>
        <p className="text-xs text-[#94A3B8]">
          Métricas técnicas reales de consumo de recursos, distribución de puntuaciones de clips y rendimiento de workers
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-[#1B1E25] p-5">
          <div className="text-xs text-[#94A3B8]">Minutos Totales Analizados</div>
          <div className="mt-2 text-3xl font-extrabold text-[#FFD43B]">
            {dash?.stats?.minutesProcessed ?? 0} min
          </div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-[#1B1E25] p-5">
          <div className="text-xs text-[#94A3B8]">Clips Generados por IA</div>
          <div className="mt-2 text-3xl font-extrabold text-[#F8FAFC]">
            {dash?.stats?.clipsCreated ?? 0}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-[#1B1E25] p-5">
          <div className="text-xs text-[#94A3B8]">Videos Originales en Almacenamiento</div>
          <div className="mt-2 text-3xl font-extrabold text-[#F8FAFC]">
            {dash?.stats?.videosProcessed ?? 0}
          </div>
        </div>
      </div>
    </div>
  );
}
