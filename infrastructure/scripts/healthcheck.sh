#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:4000/api/v1/health}"
WEB_URL="${WEB_URL:-http://localhost:3000}"
AI_URL="${AI_URL:-http://localhost:8000/health}"

echo "Verificando salud de servicios de BANANA CLIPS AI STUDIO..."
curl -fsS "$API_URL" && echo " [OK] API Backend"
curl -fsS "$AI_URL" && echo " [OK] AI Multimedia Service"
curl -fsS "$WEB_URL" >/dev/null && echo " [OK] Web Frontend"
echo "Todos los servicios principales responden correctamente."
