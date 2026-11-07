'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/store';

export default function AdminWorkersPage() {
  const [workers, setWorkers] = useState<any[]>([]);
  useEffect(() => {
    apiFetch('/admin/overview').then((res) => setWorkers(res.workers || []));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">Workers de Procesamiento y Hardware del Servidor</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {workers.map((w) => (
          <div key={w.id} className="rounded-2xl border border-slate-800 bg-[#1B1E25] p-5 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-[#FFD43B]">{w.workerName}</span>
              <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 font-bold text-emerald-400">
                {w.status}
              </span>
            </div>
            <div>Cola: <strong>{w.queueName}</strong></div>
            <div>Perfil Hardware: <strong>{w.hardwareProfile}</strong></div>
            {w.gpuName && (
              <div>GPU Detectada: {w.gpuName} ({w.vramUsedMb} MB / {w.vramTotalMb} MB VRAM)</div>
            )}
            <div className="text-[#94A3B8]">Último Heartbeat: {new Date(w.lastHeartbeatAt).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
