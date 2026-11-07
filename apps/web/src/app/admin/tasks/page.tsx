'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/store';

export default function AdminTasksPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const load = () => apiFetch('/jobs?all=true').then((r) => setJobs(r.jobs || []));
  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">Monitor Global de Tareas y Colas</h1>
      <div className="space-y-2.5">
        {jobs.map((j) => (
          <div key={j.id} className="flex items-center justify-between rounded-xl border border-slate-800 bg-[#1B1E25] p-4 text-xs">
            <div>
              <div className="font-bold text-sm">{j.videoTitle || j.jobType}</div>
              <div className="text-[#94A3B8]">ID: {j.id} • Fase: {j.currentPhase}</div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-bold text-[#FFD43B]">{j.status} ({j.progressPercent}%)</span>
              {j.status !== 'COMPLETED' && j.status !== 'CANCELED' && (
                <button
                  onClick={async () => {
                    await apiFetch(`/jobs/${j.id}/cancel`, { method: 'POST' });
                    load();
                  }}
                  className="rounded-lg bg-red-500/20 px-3 py-1 font-bold text-red-300"
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
