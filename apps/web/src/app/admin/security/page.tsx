'use client';

import React from 'react';

export default function AdminSecurityPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">Seguridad de la Aplicación y Controles Activos</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 text-xs">
        <div className="rounded-2xl border border-slate-800 bg-[#1B1E25] p-5 space-y-2">
          <div className="font-bold text-sm text-[#FFD43B]">Autenticación y Sesiones</div>
          <p className="text-[#94A3B8]">• Hash de contraseñas Argon2id / Scrypt con salt aleatorio de 16 bytes.</p>
          <p className="text-[#94A3B8]">• JWT de corta duración + Refresh Tokens rotativos con revocación en PostgreSQL.</p>
          <p className="text-[#94A3B8]">• Bloqueo automático contra fuerza bruta tras 5 intentos fallidos.</p>
          <p className="text-[#94A3B8]">• Registro público deshabilitado permanentemente (/auth/register devuelve 403).</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-[#1B1E25] p-5 space-y-2">
          <div className="font-bold text-sm text-[#FFD43B]">Protección Multimedia y Red</div>
          <p className="text-[#94A3B8]">• Validación de magic bytes reales (MP4, MOV, MKV, WEBM) + inspección FFprobe.</p>
          <p className="text-[#94A3B8]">• Protección SSRF contra localhost, 127.0.0.1, 169.254.169.254 y redes RFC1918.</p>
          <p className="text-[#94A3B8]">• URLs firmadas HMAC-SHA256 con aislamiento multiusuario estricto.</p>
          <p className="text-[#94A3B8]">• PostgreSQL, Redis y MinIO aislados en red privada interna de Docker Compose.</p>
        </div>
      </div>
    </div>
  );
}
