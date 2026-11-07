'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch, useStudioStore } from '@/lib/store';
import { UserPlus, Shield, Ban, CheckCircle, KeyRound, LogOut } from 'lucide-react';

export default function AdminUsersPage() {
  const { user } = useStudioStore();
  const [users, setUsers] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);

  // New user form
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [role, setRole] = useState<'USER' | 'SUPER_ADMIN'>('USER');
  const [status, setStatus] = useState<'ACTIVE' | 'DISABLED'>('ACTIVE');
  const [maxConcurrentJobs, setMaxConcurrentJobs] = useState(2);
  const [maxStorageGb, setMaxStorageGb] = useState(50);
  const [unlimitedMode, setUnlimitedMode] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadUsers = async () => {
    try {
      const res = await apiFetch<{ users: any[] }>('/users');
      setUsers(res.users || []);
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  if (user?.role !== 'SUPER_ADMIN') {
    return (
      <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-6 text-sm text-red-300">
        Acceso denegado. Esta sección es exclusiva para el SUPER_ADMIN.
      </div>
    );
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setFeedback(null);
    try {
      await apiFetch('/users', {
        method: 'POST',
        body: JSON.stringify({
          fullName,
          username,
          email: email || undefined,
          temporaryPassword,
          role,
          status,
          limits: {
            maxConcurrentJobs,
            maxStorageGb,
            unlimitedMode,
          },
        }),
      });
      setShowModal(false);
      setFullName('');
      setUsername('');
      setEmail('');
      setTemporaryPassword('');
      setFeedback(`Usuario @${username} creado exitosamente con cambio de contraseña obligatorio en el primer acceso.`);
      await loadUsers();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const handleToggleStatus = async (u: any) => {
    setErrorMsg(null);
    const nextStatus = u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    try {
      await apiFetch(`/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadUsers();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const handleRevokeSessions = async (u: any) => {
    await apiFetch(`/users/${u.id}/revoke-sessions`, { method: 'POST' });
    setFeedback(`Sesiones activas de @${u.username} revocadas inmediatamente.`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#F8FAFC]">
            Panel de Usuarios y Control de Recursos (/admin/users)
          </h1>
          <p className="text-xs text-[#94A3B8]">
            Creación manual de cuentas privadas, cuotas de almacenamiento/trabajos, revocación de sesiones y protección del último SUPER_ADMIN
          </p>
        </div>

        <button
          type="button"
          data-testid="btn-nuevo-usuario"
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-xl bg-[#FFD43B] px-5 py-2.5 text-sm font-bold text-[#111318] shadow hover:bg-[#FFB703]"
        >
          <UserPlus className="h-4 w-4" /> Nuevo usuario
        </button>
      </div>

      {feedback && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-300">
          {feedback}
        </div>
      )}
      {errorMsg && (
        <div
          data-testid="admin-users-error"
          className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300"
        >
          {errorMsg}
        </div>
      )}

      {/* Users Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-[#1B1E25]">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-800 bg-[#111318] text-[#94A3B8]">
            <tr>
              <th className="p-3.5">Nombre completo</th>
              <th className="p-3.5">Usuario</th>
              <th className="p-3.5">Correo electrónico</th>
              <th className="p-3.5">Rol</th>
              <th className="p-3.5">Estado</th>
              <th className="p-3.5">Cuotas / Consumo</th>
              <th className="p-3.5">Último acceso</th>
              <th className="p-3.5">Fecha creación</th>
              <th className="p-3.5">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {users.map((u) => (
              <tr key={u.id} data-testid={`user-row-${u.username}`}>
                <td className="p-3.5 font-bold text-[#F8FAFC]">{u.fullName}</td>
                <td className="p-3.5 text-[#FFD43B]">@{u.username}</td>
                <td className="p-3.5 text-[#94A3B8]">{u.email || '—'}</td>
                <td className="p-3.5">
                  <span className="rounded bg-slate-800 px-2 py-0.5 font-bold text-[#F8FAFC]">
                    {u.role}
                  </span>
                </td>
                <td className="p-3.5">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                      u.status === 'ACTIVE'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}
                  >
                    {u.status}
                  </span>
                </td>
                <td className="p-3.5 text-[#94A3B8]">
                  {u.unlimitedMode
                    ? 'Ilimitado'
                    : `${u.maxConcurrentJobs} jobs / ${u.maxStorageGb} GB`}{' '}
                  • ({u.clipsGenerated} clips)
                </td>
                <td className="p-3.5 text-[#94A3B8]">
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Nunca'}
                </td>
                <td className="p-3.5 text-[#94A3B8]">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
                <td className="p-3.5">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      data-testid={`toggle-status-${u.username}`}
                      onClick={() => handleToggleStatus(u)}
                      className="rounded-lg border border-slate-700 px-2.5 py-1 text-[11px] font-semibold hover:border-[#FFD43B]"
                    >
                      {u.status === 'ACTIVE' ? 'Desactivar' : 'Activar'}
                    </button>
                    <button
                      type="button"
                      data-testid={`revoke-sessions-${u.username}`}
                      onClick={() => handleRevokeSessions(u)}
                      className="rounded-lg border border-red-500/40 px-2.5 py-1 text-[11px] text-red-300 hover:bg-red-500/10"
                    >
                      Revocar sesiones
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create User Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <form
            onSubmit={handleCreateUser}
            className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-800 bg-[#1B1E25] p-6"
          >
            <h2 className="text-lg font-bold text-[#FFD43B]">Crear Nuevo Usuario Autorizado</h2>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#94A3B8]">Nombre completo</label>
                <input
                  type="text"
                  required
                  data-testid="new-user-fullname"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-[#111318] p-2.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#94A3B8]">Nombre de usuario</label>
                <input
                  type="text"
                  required
                  data-testid="new-user-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-[#111318] p-2.5 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#94A3B8]">
                  Correo electrónico (opcional)
                </label>
                <input
                  type="email"
                  data-testid="new-user-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-[#111318] p-2.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#94A3B8]">
                  Contraseña temporal segura
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  data-testid="new-user-password"
                  value={temporaryPassword}
                  onChange={(e) => setTemporaryPassword(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-[#111318] p-2.5 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#94A3B8]">Rol</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-[#111318] p-2.5 text-xs"
                >
                  <option value="USER">USER (Estándar Privado)</option>
                  <option value="SUPER_ADMIN">SUPER_ADMIN (Administrador Total)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#94A3B8]">Estado Inicial</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-[#111318] p-2.5 text-xs"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="DISABLED">DISABLED</option>
                </select>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#111318] p-3 space-y-2">
              <div className="text-xs font-bold text-[#FFD43B]">Límites Administrativos de Recursos (Sin Monetización)</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-[#94A3B8]">Trabajos simultáneos máx.</label>
                  <input
                    type="number"
                    value={maxConcurrentJobs}
                    onChange={(e) => setMaxConcurrentJobs(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-[#1B1E25] p-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#94A3B8]">Cuota Almacenamiento (GB)</label>
                  <input
                    type="number"
                    value={maxStorageGb}
                    onChange={(e) => setMaxStorageGb(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-[#1B1E25] p-1.5 text-xs"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-[#94A3B8] pt-1">
                <input
                  type="checkbox"
                  checked={unlimitedMode}
                  onChange={(e) => setUnlimitedMode(e.target.checked)}
                />
                Permitir uso ilimitado de recursos del servidor
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-xl border border-slate-700 px-4 py-2 text-xs text-[#94A3B8]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                data-testid="submit-create-user"
                className="rounded-xl bg-[#FFD43B] px-5 py-2 text-xs font-bold text-[#111318]"
              >
                Crear Usuario
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
