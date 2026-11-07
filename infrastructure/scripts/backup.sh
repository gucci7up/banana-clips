#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups/$(date +%Y%m%d_%H%M%S)}"
mkdir -p "$BACKUP_DIR"

echo "Iniciando respaldo seguro de PostgreSQL y volúmenes multimedia en $BACKUP_DIR..."
docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:-bananaclips}" "${POSTGRES_DB:-bananaclips_db}" | gzip > "$BACKUP_DIR/postgres_db.sql.gz"
docker run --rm -v banana_minio_data:/data -v "$(pwd)/$BACKUP_DIR":/backup alpine tar czf /backup/minio_data.tar.gz /data

echo "Respaldo completado en $BACKUP_DIR"
