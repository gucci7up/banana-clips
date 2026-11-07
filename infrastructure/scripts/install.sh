#!/usr/bin/env bash
set -euo pipefail

echo "============================================================"
echo " BANANA CLIPS AI STUDIO — Instalación y Preparación"
echo "============================================================"

if [ ! -f .env ]; then
  echo "[1/4] Creando archivo .env desde .env.example..."
  cp .env.example .env
fi

echo "[2/4] Instalando dependencias del monorepo Node.js..."
npm install

echo "[3/4] Inicializando esquema de base de datos y bootstrap idempotente..."
npm run db:seed || true

echo "[4/4] Verificando disponibilidad de FFmpeg..."
ffmpeg -version | head -n 2

echo "Instalación completada. Usa ./infrastructure/scripts/dev.sh o despliega en Dokploy."
