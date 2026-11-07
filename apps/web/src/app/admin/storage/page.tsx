'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/store';

export default function AdminStoragePage() {
  const [buckets, setBuckets] = useState<any[]>([]);
  useEffect(() => {
    apiFetch('/admin/overview').then((res) => setBuckets(res.storageBuckets || []));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">Almacenamiento MinIO S3 y Volúmenes Persistentes</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {buckets.map((b) => (
          <div key={b.bucket} className="rounded-2xl border border-slate-800 bg-[#1B1E25] p-5">
            <div className="text-sm font-bold text-[#FFD43B]">{b.bucket}</div>
            <div className="mt-2 text-2xl font-extrabold">{b.files} archivos</div>
            <div className="text-xs text-[#94A3B8]">
              {(Number(b.bytes || 0) / (1024 * 1024)).toFixed(2)} MB ocupados
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
