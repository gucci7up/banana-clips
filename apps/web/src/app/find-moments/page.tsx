'use client';

import React, { useState } from 'react';
import { apiFetch } from '@/lib/store';
import { Search, Sparkles, Clock, Scissors, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

const SUGGESTED_QUERIES = [
  'Encuentra cuando el presentador se ríe',
  'Busca las mejores eliminaciones de Fortnite',
  'Encuentra cuando hablan de dinero',
  'Encuentra la parte donde el invitado cuenta una historia impactante',
  'Busca todas las veces que alguien menciona inteligencia artificial',
  'Encuentra momentos con celebraciones',
];

export default function FindMomentsPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [creatingClipFor, setCreatingClipFor] = useState<string | null>(null);

  const runSearch = async (qText: string) => {
    setQuery(qText);
    setLoading(true);
    try {
      const res = await apiFetch<{ results: any[] }>('/find-moments', {
        method: 'POST',
        body: JSON.stringify({ query: qText }),
      });
      setResults(res.results || []);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClipFromMoment = async (item: any) => {
    setCreatingClipFor(item.id);
    try {
      await apiFetch('/jobs', {
        method: 'POST',
        body: JSON.stringify({
          videoId: item.videoId,
          jobType: 'AI_CLIPPING',
          targetDurationSec: 15,
          aspectRatio: '9:16',
          syncExecution: true,
        }),
      });
      router.push('/ai-clipping');
    } finally {
      setCreatingClipFor(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-800 pb-4">
        <h1 className="text-2xl font-extrabold text-[#F8FAFC]">Find Moments — Búsqueda Semántica y Visual</h1>
        <p className="text-xs text-[#94A3B8]">
          Búsqueda vectorial con pgvector (embeddings 384-d) sobre transcripciones, hablantes, eventos y descripciones visuales de escenas
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          runSearch(query);
        }}
        className="flex gap-3"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-[#94A3B8]" />
          <input
            type="text"
            value={query}
            data-testid="find-moments-input"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Escribe en lenguaje natural el momento exacto que buscas..."
            className="w-full rounded-xl border border-slate-700 bg-[#1B1E25] pl-10 pr-4 py-2.5 text-sm text-[#F8FAFC] focus:border-[#FFD43B] focus:outline-none"
          />
        </div>
        <button
          type="submit"
          data-testid="find-moments-submit"
          className="flex items-center gap-2 rounded-xl bg-[#FFD43B] px-6 py-2.5 text-sm font-bold text-[#111318] hover:bg-[#FFB703]"
        >
          <Sparkles className="h-4 w-4" /> Buscar Momentos
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {SUGGESTED_QUERIES.map((sq) => (
          <button
            key={sq}
            type="button"
            onClick={() => runSearch(sq)}
            className="rounded-full border border-slate-800 bg-[#1B1E25] px-3.5 py-1.5 text-xs text-[#94A3B8] hover:border-[#FFD43B] hover:text-[#F8FAFC]"
          >
            "{sq}"
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="rounded-2xl border border-slate-800 bg-[#1B1E25] p-8 text-center text-sm text-[#94A3B8]">
            Consultando índice vectorial pgvector...
          </div>
        ) : results.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 bg-[#1B1E25] p-8 text-center text-xs text-[#94A3B8]">
            Selecciona una de las consultas sugeridas o escribe tu búsqueda para localizar timestamps exactos.
          </div>
        ) : (
          results.map((item) => (
            <div
              key={`${item.matchType}-${item.id}`}
              data-testid="find-moment-result"
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-[#1B1E25] p-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-[#FFD43B]/20 px-2 py-0.5 text-[11px] font-bold text-[#FFD43B]">
                    {item.matchType === 'SEMANTIC_TRANSCRIPT' ? 'Índice Semántico Voz' : 'Índice Visual Escena'}
                  </span>
                  <span className="flex items-center gap-1 text-xs font-semibold text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Confianza: {Math.round(item.confidence * 100)}%
                  </span>
                  <span className="flex items-center gap-1 text-xs text-[#94A3B8]">
                    <Clock className="h-3.5 w-3.5" /> {item.timestampSec}s - {item.endSec}s
                  </span>
                </div>
                <div className="text-sm font-semibold text-[#F8FAFC]">{item.description}</div>
                <div className="text-xs text-[#94A3B8]">Video origen: {item.videoTitle}</div>
              </div>

              <button
                type="button"
                disabled={creatingClipFor === item.id}
                onClick={() => handleCreateClipFromMoment(item)}
                className="flex items-center gap-1.5 rounded-xl bg-[#FFD43B] px-4 py-2 text-xs font-bold text-[#111318] hover:bg-[#FFB703]"
              >
                <Scissors className="h-3.5 w-3.5" />
                {creatingClipFor === item.id ? 'Generando Clip...' : 'Crear Clip de este Momento'}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
