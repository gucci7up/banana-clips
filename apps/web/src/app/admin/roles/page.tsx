'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/store';

export default function AdminRolesPage() {
  const [roles, setRoles] = useState<any[]>([]);
  useEffect(() => {
    apiFetch('/admin/overview').then((res) => setRoles(res.roles || []));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">Roles y Permisos RBAC</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {roles.map((r) => (
          <div key={r.id} className="rounded-2xl border border-slate-800 bg-[#1B1E25] p-5 space-y-2">
            <div className="text-base font-bold text-[#FFD43B]">{r.name}</div>
            <p className="text-xs text-[#94A3B8]">{r.description}</p>
            <pre className="rounded-xl bg-[#111318] p-3 text-xs text-emerald-400">
              {JSON.stringify(r.permissions, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
