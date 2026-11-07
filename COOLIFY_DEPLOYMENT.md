# GUÍA DE DESPLIEGUE EN COOLIFY — BANANA CLIPS AI STUDIO

Este proyecto incluye soporte nativo para **Coolify** mediante [`docker-compose.coolify.yml`](file:///e:/Apps%20news/Banana%20Clips/docker-compose.coolify.yml) (además de [`docker-compose.yml`](file:///e:/Apps%20news/Banana%20Clips/docker-compose.yml)).

## 1. Arquitectura en Coolify

En Coolify, un único recurso **Docker Compose** levanta toda la plataforma privada:
- `frontend` (Next.js App Router en el puerto `3000`) — Expuesto por el proxy Traefik/Caddy de Coolify mediante `SERVICE_FQDN_FRONTEND_3000`. Además, el frontend enruta internamente `/api/v1/*` hacia `http://api:4000`, por lo que **solo necesitas un dominio principal** (o dos si deseas exponer `api` por separado).
- `api` (NestJS/Express en el puerto `4000`)
- `ai-service` (Python FastAPI + Faster-Whisper + PySceneDetect + Embeddings en el puerto `8000`)
- `worker-ingest`, `worker-transcribe`, `worker-analyze`, `worker-render`
- `postgres` (`pgvector/pgvector:pg16`)
- `redis` (`redis:7.4-alpine`)
- `minio` (`minio/minio:latest`)

## 2. Despliegue Automático (Vía API de Coolify o SSH) o Manual

### Opción A: Despliegue desde la UI de Coolify
1. Entra a tu panel de **Coolify** → **Projects** → **Add New Resource** → **Docker Compose Empty** o **Git Repository**.
2. Selecciona el archivo `docker-compose.coolify.yml`.
3. En **Domains** del servicio `frontend`, asigna tu dominio (ej. `https://clips.tudominio.com:3000`).
4. En **Environment Variables**, define:
   - `ADMIN_USERNAME=admin`
   - `ADMIN_EMAIL=admin@tudominio.com`
   - `ADMIN_INITIAL_PASSWORD=<tu_contraseña_segura>`
   - `JWT_ACCESS_SECRET=<hex_64_bytes>`
   - `JWT_REFRESH_SECRET=<hex_64_bytes>`
   - `POSTGRES_PASSWORD=<password_pg>`
   - `REDIS_PASSWORD=<password_redis>`
   - `MINIO_ROOT_PASSWORD=<password_minio>`
5. Pulsa **Deploy**.
