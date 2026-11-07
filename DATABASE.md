# BASE DE DATOS — BANANA CLIPS AI STUDIO

## 1. Esquema Normalizado (27 Entidades Prisma + PostgreSQL + `pgvector`)

El esquema se encuentra en [`packages/database/prisma/schema.prisma`](file:///e:/Apps%20news/Banana%20Clips/packages/database/prisma/schema.prisma) y su migración SQL reproducible en [`packages/database/prisma/migrations/20261106000000_init/migration.sql`](file:///e:/Apps%20news/Banana%20Clips/packages/database/prisma/migrations/20261106000000_init/migration.sql).

### Entidades Implementadas

1. `Role` (`SUPER_ADMIN`, `USER`)
2. `User` (Credenciales Argon2id, estado `ACTIVE`/`DISABLED`, `mustChangePassword`, `brandKit`, `projectPresets`)
3. `Session` (Refresh tokens rotativos hasheados con SHA-256, IP, User-Agent, revocación instantánea)
4. `UserResourceLimit` (Límites administrativos de concurrencia, tamaño de archivo, duración máxima y cuota de almacenamiento; sin monetización)
5. `ResourceUsage` (Consumo real de bytes, minutos procesados, videos y clips por usuario)
6. `Project` (Agrupación lógica e historial del `AI Clip Assistant`)
7. `Video` (Video original vinculado a `StorageObject`)
8. `VideoSource` (`UPLOAD`, `URL`, `LIBRARY`, `BATCH`, `LIVE_RTMP`)
9. `VideoMetadata` (Duración, resolución, FPS, códecs de video/audio, bitrate y relación de aspecto verificados con `FFprobe`)
10. `Transcript` (Texto completo, idioma, modelo utilizado, SRT y VTT)
11. `TranscriptSegment` (Segmentos por frase con timestamps por palabra y columna vectorial `embedding vector(384)`)
12. `Speaker` (Identificación de hablantes y coordenadas faciales promedio para Speaker Tracking)
13. `Scene` (Escenas detectadas con puntuación de movimiento, pico de audio y `visualEmbedding vector(384)`)
14. `VisualEvent` (Eventos multimodales y marcadores de Game Clipping / Live Clipper)
15. `AnalysisJob` (Estado del pipeline asíncrono, porcentaje real y fase actual)
16. `JobAttempt` (Historial de intentos por worker y perfil de hardware utilizado)
17. `Clip` (Clips generados con metadatos, hashtags, huella de deduplicación y almacenamiento)
18. `ClipScore` (Puntuación de calidad 0-100 en las 7 dimensiones + explicación textual)
19. `ClipScoreBreakdown` (Desglose técnico de apertura, ritmo en palabras/segundo y claridad acústica)
20. `ClipTranscript` (Transcripción recortada del clip en JSON, SRT, VTT y ASS)
21. `EditProject` (Estado de edición no destructiva versionado con pilas `historyStack` y `redoStack`)
22. `EditOperation` (Registro auditable de operaciones en timeline y texto)
23. `Montage` (Proyectos de AI Montage)
24. `MontageItem` (Orden de clips, recortes y transiciones dentro de un montaje)
25. `Export` (Exportaciones renderizadas con `FFmpeg` en 720p/1080p/1440p/4K)
26. `StorageObject` (Objetos almacenados en buckets separados: `banana-videos`, `banana-clips`, `banana-previews`, `banana-thumbnails`, `banana-models`, `banana-exports`)
27. `SocialAccount`, `SocialPost`, `Template`, `ProcessingWorker`, `AuditLog`, `SystemSetting`
