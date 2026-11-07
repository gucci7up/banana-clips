'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, useStudioStore } from '@/lib/store';
import { Scissors, Lock, ShieldAlert, ArrowRight } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useStudioStore();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ accessToken: string; user: any }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      });
      setAuth(res.user, res.accessToken);
      if (res.user.mustChangePassword) {
        router.push('/settings?forcePasswordChange=1');
      } else {
        router.push('/dashboard');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Credenciales inválidas.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#111318] p-4 text-[#F8FAFC]">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#1B1E25] p-8 shadow-2xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FFD43B] to-[#FFB703] text-[#111318] shadow-lg">
            <Scissors className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#FFD43B]">BANANA CLIPS AI STUDIO</h1>
          <p className="mt-1 text-xs text-[#94A3B8]">
            Plataforma privada de clipping e inteligencia artificial multimedia
          </p>
        </div>

        <div className="mb-6 flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          <Lock className="h-4 w-4 shrink-0 text-[#FFD43B]" />
          <span>Acceso exclusivo para cuentas autorizadas por el propietario (Sin registro público).</span>
        </div>

        {errorMsg && (
          <div
            data-testid="login-error"
            className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300"
          >
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#94A3B8]">
              Usuario o Correo Electrónico
            </label>
            <input
              type="text"
              required
              data-testid="login-identifier"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="admin o correo@bananaclips.local"
              className="mt-1.5 w-full rounded-xl border border-slate-700 bg-[#111318] px-3.5 py-2.5 text-sm text-[#F8FAFC] focus:border-[#FFD43B] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#94A3B8]">Contraseña</label>
            <input
              type="password"
              required
              data-testid="login-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="mt-1.5 w-full rounded-xl border border-slate-700 bg-[#111318] px-3.5 py-2.5 text-sm text-[#F8FAFC] focus:border-[#FFD43B] focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            data-testid="login-submit"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FFD43B] px-5 py-3 text-sm font-bold text-[#111318] shadow-md transition hover:bg-[#FFB703] disabled:opacity-50"
          >
            <span>{loading ? 'Verificando acceso...' : 'Iniciar Sesión en el Estudio'}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
