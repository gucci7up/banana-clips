'use client';

import React, { useState } from 'react';
import { apiFetch, useStudioStore } from '@/lib/store';
import { useRouter } from 'next/navigation';
import { Lock, CheckCircle2 } from 'lucide-react';

export default function SettingsPage() {
  const { user, setAuth } = useStudioStore();
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setErrorMsg(null);
    try {
      const res = await apiFetch<{ accessToken: string }>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (user) {
        setAuth({ ...user, mustChangePassword: false }, res.accessToken);
      }
      setMessage('Contraseña actualizada correctamente.');
      setCurrentPassword('');
      setNewPassword('');
      setTimeout(() => router.push('/dashboard'), 1000);
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="border-b border-slate-800 pb-4">
        <h1 className="text-2xl font-extrabold text-[#F8FAFC]">Configuración de Cuenta y Brand Kit</h1>
        <p className="text-xs text-[#94A3B8]">
          Seguridad de acceso Argon2id, cambio de contraseña y preferencias personales
        </p>
      </div>

      {user?.mustChangePassword && (
        <div
          data-testid="force-password-change-banner"
          className="rounded-xl border border-amber-500/50 bg-amber-500/15 p-4 text-xs text-amber-200"
        >
          <strong>Cambio obligatorio de contraseña inicial:</strong> Estás iniciando sesión con una contraseña temporal asignada por el SUPER_ADMIN. Por seguridad debes definir una nueva contraseña antes de continuar.
        </div>
      )}

      {message && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-300">
          <CheckCircle2 className="h-4 w-4" /> <span>{message}</span>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">
          {errorMsg}
        </div>
      )}

      <form
        onSubmit={handlePasswordChange}
        className="space-y-4 rounded-2xl border border-slate-800 bg-[#1B1E25] p-6"
      >
        <h2 className="flex items-center gap-2 text-base font-bold text-[#FFD43B]">
          <Lock className="h-4 w-4" /> Cambiar Contraseña
        </h2>
        <div>
          <label className="block text-xs font-semibold text-[#94A3B8]">Contraseña Actual</label>
          <input
            type="password"
            value={currentPassword}
            data-testid="input-current-password"
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-700 bg-[#111318] p-2.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#94A3B8]">
            Nueva Contraseña Segura (Mínimo 8 caracteres)
          </label>
          <input
            type="password"
            required
            minLength={8}
            value={newPassword}
            data-testid="input-new-password"
            onChange={(e) => setNewPassword(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-700 bg-[#111318] p-2.5 text-sm"
          />
        </div>
        <button
          type="submit"
          data-testid="btn-save-password"
          className="rounded-xl bg-[#FFD43B] px-6 py-2.5 text-sm font-bold text-[#111318]"
        >
          Actualizar Contraseña
        </button>
      </form>
    </div>
  );
}
