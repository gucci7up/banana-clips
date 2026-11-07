#!/usr/bin/env bash
set -euo pipefail

echo "Iniciando BANANA CLIPS AI STUDIO en modo desarrollo..."
trap 'kill 0' SIGINT
python3 apps/ai-service/main.py &
npm run dev:api &
npm run dev:web &
wait
