'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, useStudioStore } from '@/lib/store';
import {
  Lock,
  ShieldAlert,
  ArrowRight,
  User,
  KeyRound,
  Eye,
  EyeOff,
} from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useStudioStore();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#0A0B0E] p-4 text-[#F8FAFC] sm:p-6 lg:p-10">
      {/* Ambient Animated Background Glows */}
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-[#FFD43B]/15 blur-[130px]" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-amber-500/15 blur-[130px]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,212,59,0.06),transparent_60%)]" />

      <div className="relative z-10 grid w-full max-w-5xl grid-cols-1 overflow-hidden rounded-3xl border border-zinc-800/80 bg-[#121318]/90 shadow-[0_25px_80px_-15px_rgba(0,0,0,0.85)] backdrop-blur-xl lg:grid-cols-12">
        {/* LEFT SHOWCASE PANEL (7 cols on desktop) */}
        <div className="relative flex flex-col items-center justify-center border-b border-zinc-800/70 bg-gradient-to-br from-[#16181F] via-[#121318] to-[#1A160B] p-8 sm:p-12 lg:col-span-7 lg:border-b-0 lg:border-r">
          <div className="flex flex-col items-center text-center">
            {/* Official Banana Clips Logo — Centered */}
            <div className="mb-8 flex w-full items-center justify-center">
              <img
                src="/banana-clips-logo.png"
                alt="Banana Clips Logo"
                className="h-36 w-auto max-w-full object-contain drop-shadow-[0_15px_40px_rgba(255,212,59,0.35)] transition-transform duration-300 hover:scale-[1.03] sm:h-44"
              />
            </div>

            <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
              Convierte videos largos en{' '}
              <span className="bg-gradient-to-r from-[#FFD43B] via-amber-300 to-[#FFB703] bg-clip-text text-transparent">
                clips virales con IA
              </span>
            </h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-zinc-400">
              Suite privada de recorte inteligente, reencuadre vertical 9:16 automático, subtítulos animados palabra por palabra y edición acelerada.
            </p>
          </div>
        </div>

        {/* RIGHT LOGIN FORM PANEL (5 cols on desktop) */}
        <div className="flex flex-col justify-center bg-[#14161D] p-8 sm:p-10 lg:col-span-5">
          <div className="mb-6">
            <h2 className="text-xl font-extrabold text-white">Bienvenido de nuevo</h2>
            <p className="mt-1 text-xs text-zinc-400">
              Ingresa tus credenciales para acceder al estudio de producción
            </p>
          </div>

          <div className="mb-6 flex items-center gap-2.5 rounded-2xl border border-[#FFD43B]/25 bg-[#FFD43B]/10 p-3.5 text-xs text-amber-200/90">
            <Lock className="h-4 w-4 shrink-0 text-[#FFD43B]" />
            <span>Acceso privado exclusivo para cuentas autorizadas (Sin registro público).</span>
          </div>

          {errorMsg && (
            <div
              data-testid="login-error"
              className="mb-5 flex items-center gap-2.5 rounded-2xl border border-red-500/40 bg-red-500/10 p-3.5 text-xs font-medium text-red-300"
            >
              <ShieldAlert className="h-4 w-4 shrink-0 text-red-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-zinc-400">
                Usuario o Correo
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  required
                  data-testid="login-identifier"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Tu usuario o correo electrónico"
                  className="w-full rounded-2xl border border-zinc-800 bg-[#0D0E12] py-3 pl-10 pr-4 text-sm text-white placeholder-zinc-600 transition focus:border-[#FFD43B] focus:outline-none focus:ring-2 focus:ring-[#FFD43B]/20"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-zinc-400">
                Contraseña
              </label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  data-testid="login-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full rounded-2xl border border-zinc-800 bg-[#0D0E12] py-3 pl-10 pr-11 text-sm text-white placeholder-zinc-600 transition focus:border-[#FFD43B] focus:outline-none focus:ring-2 focus:ring-[#FFD43B]/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  aria-label="Mostrar u ocultar contraseña"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              data-testid="login-submit"
              className="group mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#FFD43B] to-[#FFB703] px-5 py-3.5 text-sm font-black text-[#111318] shadow-[0_10px_25px_-5px_rgba(255,212,59,0.4)] transition-all hover:brightness-105 disabled:opacity-50"
            >
              <span>{loading ? 'Verificando acceso...' : 'Entrar a Banana Clips'}</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
          </form>

          <div className="mt-8 text-center text-[11px] text-zinc-500">
            Protegido con autenticación JWT HttpOnly, control de sesiones y aislamiento multiusuario.
          </div>
        </div>
      </div>
    </div>
  );
}
