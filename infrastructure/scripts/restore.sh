#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Uso: ./restore.sh <directorio_backup>"
  exit 1
fi

BACKUP_DIR="$1"
echo "Restaurando base de datos PostgreSQL desde $BACKUP_DIR/postgres_db.sql.gz..."
gunzip -c "$BACKUP_DIR/postgres_db.sql.gz" | docker compose exec -T postgres psql -U "${POSTGRES_USER:-bananaclips}" "${POSTGRES_DB:-bananaclips_db}"

if [ -f "$BACKUP_DIR/minio_data.tar.gz" ]; then
  echo "Restaurando volumen multimedia MinIO..."
  docker run --rm -v banana_minio_data:/data -v "$(pwd)/$BACKUP_DIR":/backup alpine tar xzf /backup/minio_data.tar.gz -C /
fi

echo "Restauración finalizada."
