#!/usr/bin/env bash
set -e

echo "=================================================================="
echo " BANANA CLIPS AI STUDIO — Iniciando Servicios en Producción"
echo "=================================================================="

mkdir -p /data/media /data/models /data/pgdata

export NODE_ENV=production
export API_PORT=4000
export INTERNAL_API_ORIGIN="http://127.0.0.1:4000"
export LOCAL_STORAGE_PATH="${LOCAL_STORAGE_PATH:-/data/media}"
export EMBEDDED_DB_PATH="${EMBEDDED_DB_PATH:-/data/pgdata}"

echo "[1/4] Iniciando Microservicio Python de IA y Multimedia (Puerto 8000)..."
python3 /app/apps/ai-service/main.py &

echo "[2/4] Iniciando API Backend Privada /api/v1 y Bootstrap Idempotente (Puerto 4000)..."
npx tsx /app/apps/api/src/main.ts &

# Wait for API healthcheck
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:4000/api/v1/health >/dev/null 2>&1; then
    echo " -> API Backend lista."
    break
  fi
  sleep 1
done

echo "[3/4] Iniciando Workers Asíncronos (ingest, transcribe, analyze, render)..."
npx tsx /app/workers/src/worker-entry.ts --role=worker-analyze &

echo "[4/4] Iniciando Frontend Web Next.js en Puerto 3000..."
cd /app/apps/web
exec npx next start -p 3000 -H 0.0.0.0
