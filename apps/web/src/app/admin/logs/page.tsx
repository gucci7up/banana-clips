'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/store';
import { FileText, RefreshCw, Search, ShieldCheck, Activity, Clock } from 'lucide-react';

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadLogs = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ auditLogs: any[] }>('/admin/overview');
      setLogs(res.auditLogs || []);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const filtered = logs.filter((l) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      String(l.action || '').toLowerCase().includes(q) ||
      String(l.resource || '').toLowerCase().includes(q) ||
      String(l.username || '').toLowerCase().includes(q) ||
      String(l.details || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#FFD43B]/30 bg-[#FFD43B]/10 px-3 py-0.5 text-[11px] font-extrabold text-[#FFD43B]">
            <ShieldCheck className="h-3.5 w-3.5" /> Auditoría en Tiempo Real • PostgreSQL
          </div>
          <h1 className="mt-1 text-2xl font-extrabold text-white">
            Logs Estructurados y Auditoría del Sistema
          </h1>
          <p className="text-xs text-slate-400">
            Registro completo de inicios de sesión, generación de clips IA, Grok 4.20, Live Clipper y cambios de configuración ({filtered.length} eventos)
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar acción, usuario o recurso..."
              className="w-60 rounded-xl border border-slate-700 bg-[#131720] pl-9 pr-3 py-2 text-xs text-white focus:border-[#FFD43B] focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={loadLogs}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-[#131720] px-3.5 py-2 text-xs font-bold text-[#FFD43B] hover:border-[#FFD43B]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Actualizar
          </button>
        </div>
      </div>

      {loading ? (
        <div className="studio-card p-8 text-center text-xs text-slate-400">
          Cargando registros de auditoría desde PostgreSQL...
        </div>
      ) : filtered.length === 0 ? (
        <div className="studio-card p-8 text-center text-xs text-slate-400">
          No se encontraron eventos que coincidan con el filtro.
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((l) => (
            <div
              key={l.id}
              className="studio-card flex flex-col justify-between gap-2 p-3.5 text-xs sm:flex-row sm:items-center"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-lg border border-[#FFD43B]/30 bg-[#FFD43B]/15 px-2.5 py-0.5 text-[11px] font-black text-[#FFD43B]">
                    <Activity className="h-3 w-3" /> {l.action}
                  </span>
                  <span className="rounded-lg bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-200">
                    Recurso: {l.resource || 'Sistema'}
                  </span>
                  <span className="text-[11px] text-emerald-400 font-bold">
                    👤 {l.username || 'Sistema'}
                  </span>
                </div>
                {l.details && (
                  <div className="font-mono text-[11px] text-slate-400 break-all">
                    {typeof l.details === 'string' ? l.details : JSON.stringify(l.details)}
                  </div>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1.5 text-[11px] text-slate-400">
                <Clock className="h-3.5 w-3.5 text-slate-500" />
                <span>{new Date(l.createdAt).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
