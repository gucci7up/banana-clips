'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/store';

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);

  useEffect(() => {
    apiFetch<{ templates: any[] }>('/templates').then((res) => setTemplates(res.templates || []));
  }, []);

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-800 pb-4">
        <h1 className="text-2xl font-extrabold text-[#F8FAFC]">Plantillas y Brand Kit</h1>
        <p className="text-xs text-[#94A3B8]">
          Plantillas del sistema para Subtítulos ASS (Classic, Bold, Neon, Minimal, Gaming, Podcast, Karaoke, Dynamic, Premium) y Montajes
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {templates.map((t) => (
          <div key={t.id} className="rounded-2xl border border-slate-800 bg-[#1B1E25] p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-[#FFD43B]">{t.name}</span>
              <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-[#94A3B8]">
                {t.category}
              </span>
            </div>
            <pre className="overflow-x-auto rounded-xl bg-[#111318] p-2.5 text-[11px] text-[#94A3B8]">
              {JSON.stringify(t.configJson, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
