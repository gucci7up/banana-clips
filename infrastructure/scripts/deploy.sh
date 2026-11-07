#!/usr/bin/env bash
set -euo pipefail

PROFILE="${1:-gpu}"
echo "============================================================"
echo " BANANA CLIPS AI STUDIO — Despliegue Dokploy ($PROFILE)"
echo "============================================================"

if [ "$PROFILE" = "cpu" ]; then
  docker compose -f docker-compose.yml -f docker-compose.cpu.yml up -d --build
else
  docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
fi

echo "Ejecutando migraciones reproducibles en PostgreSQL..."
docker compose exec -T api npm --workspace=@banana/database run migrate || true
docker compose exec -T api npm --workspace=@banana/database run seed || true

echo "Despliegue completado exitosamente."
