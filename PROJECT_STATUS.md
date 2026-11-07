# ESTADO DEL PROYECTO — BANANA CLIPS AI STUDIO (`PROJECT_STATUS.md`)

Última actualización: **2026-11-06**

---

## Resumen de Fases de Implementación

| Fase | Descripción | Estado | Verificación |
|---|---|---|---|
| **FASE 1** | Monorepo, Docker Compose (Dokploy), base de datos PostgreSQL + `pgvector` (27 entidades), autenticación privada Argon2id + JWT y UI inicial con identidad visual Banana Clips (`#FFD43B`, `#111318`, `#1B1E25`). | **COMPLETADO** | Esquema migrado y verificado. |
| **FASE 2** | Panel administrativo `/admin/users`, creación manual de usuarios, cambio obligatorio de contraseña temporal, subida real de videos, almacenamiento por buckets, biblioteca multimedia y jobs asíncronos. | **COMPLETADO** | Probado en suite de integración. |
| **FASE 3** | Integración de `FFmpeg` / `FFprobe`, normalización acústica, detección de voz/silencios, transcripción con timestamps por palabra y segmentación natural por frases. | **COMPLETADO** | Verificado con `FFprobe` y `pytest`. |
| **FASE 4** | Análisis semántico y visual, sistema de puntuación de calidad 0-100 en 7 dimensiones (`HOOK`, `STORY`, `EMOTION`, `ENGAGEMENT`, `CLARITY`, `VISUAL_IMPACT`, `SHAREABILITY`) con explicación textual y renderizado real de clips MP4 H.264/AAC. | **COMPLETADO** | Clips MP4 validados con `FFprobe`. |
| **FASE 5** | Editor de video no destructivo basado en timeline, Text-Based Editing sobre transcripción, 9 plantillas de subtítulos dinámicos ASS/SRT/VTT, Auto-Reframe (`9:16`, `1:1`, `4:5`, `16:9`) y exportación en servidor. | **COMPLETADO** | Exportación 1080x1920 validada. |
| **FASE 6** | **Find Moments** mediante embeddings vectoriales de 384 dimensiones y consultas de similitud coseno con `pgvector` (`<=>`) sobre texto transcrito y escenas visuales. | **COMPLETADO** | Consultas semánticas verificadas. |
| **FASE 7** | **Game Clipping** con módulos detectores intercambiables (Fortnite, GTA V/VI, Valorant, Minecraft, Call of Duty, Deportes), presets y timeline de eventos con nivel de confianza explícito. | **COMPLETADO** | Probado en API y UI. |
| **FASE 8** | **Live Clipper** con soporte de captura RTMP/HLS autorizada, procesamiento progresivo, estados (`IDLE`, `CONNECTING`, `RECORDING`, `PROCESSING`, `STOPPED`, `FAILED`) y marcadores en vivo. | **COMPLETADO** | Flujo RTMP y marcadores verificados. |
| **FASE 9** | **AI Montage**, módulo de publicación social con cifrado AES-256-GCM y modo de exportación manual verificada, control administrativo de cuotas de recursos (sin pagos ni suscripciones) y configuración global. | **COMPLETADO** | Todas las rutas operativas. |
| **FASE 10** | Hardening de seguridad (SSRF, magic bytes, aislamiento multiusuario, URLs firmadas, protección del último `SUPER_ADMIN`), documentación completa (10 documentos) y suites de pruebas de integración y E2E. | **COMPLETADO** | Suites de pruebas ejecutadas. |

---

## Notas sobre el Entorno de Ejecución Local vs Producción en Dokploy

1. **Docker y Dokploy**: Todos los `Dockerfile` (`Dockerfile.web`, `Dockerfile.api`, `Dockerfile.workers`, `Dockerfile.ai-service`) y archivos `docker-compose.yml`, `docker-compose.cpu.yml` y `docker-compose.gpu.yml` están listos para importarse directamente en Dokploy sobre Ubuntu 24.04 LTS con Traefik.
2. **Base de Datos en Entorno Local sin Docker**: En esta máquina Windows donde el daemon de Docker no está instalado, la capa `@banana/database` levanta automáticamente una instancia real de PostgreSQL embebida y persistente en disco (`PGlite` con extensión `pgvector` habilitada), ejecutando exactamente la misma migración SQL y consultas vectoriales `<=>` que en el contenedor `pgvector/pgvector:pg16` de Dokploy.
3. **GPU Detectada**: Se detectó una **NVIDIA GeForce GTX 1070 (8192 MB VRAM)** mediante `nvidia-smi`, seleccionando automáticamente el perfil `NVIDIA_LOW_VRAM` con cuantización `int8` y descarga de memoria tras cada trabajo.
