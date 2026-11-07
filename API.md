# DISEÑO DE API REST (`/api/v1/`) — BANANA CLIPS AI STUDIO

Especificación OpenAPI 3.1 disponible en tiempo de ejecución en `GET /api/v1/openapi.json`.

## 1. Autenticación (`/api/v1/auth`)

- `POST /api/v1/auth/login` — Autentica mediante usuario o correo y contraseña. Devuelve `accessToken`, `refreshToken` y establece cookies `HttpOnly`.
- `POST /api/v1/auth/refresh` — Rota el refresh token activo e invalida el anterior.
- `POST /api/v1/auth/logout` — Revoca las sesiones del usuario y limpia cookies.
- `GET /api/v1/auth/me` — Devuelve el perfil autenticado y sus cuotas de recursos.
- `POST /api/v1/auth/change-password` — Cambia la contraseña y desactiva el indicador `mustChangePassword`.
- `POST /api/v1/auth/register` y `/api/v1/auth/signup` — **Bloqueados permanentemente (HTTP 403)** y registrados en `AuditLog`.

## 2. Administración de Usuarios (`/api/v1/users`) — Exclusivo `SUPER_ADMIN`

- `GET /api/v1/users` — Lista usuarios, roles, estado, cuotas y consumo real.
- `POST /api/v1/users` — Crea manualmente un usuario con contraseña temporal segura (`mustChangePassword = true`).
- `PATCH /api/v1/users/:id` — Edita datos, cambia estado (`ACTIVE`/`DISABLED`), restablece contraseña o ajusta cuotas. Protege al último `SUPER_ADMIN` activo.
- `DELETE /api/v1/users/:id` — Elimina un usuario (bloqueado si es el último `SUPER_ADMIN` activo).
- `POST /api/v1/users/:id/revoke-sessions` — Revoca inmediatamente todas las sesiones del usuario.

## 3. Subidas, Videos, Jobs y Clips

- `POST /api/v1/uploads/video` — Subida multipart con validación de magic bytes reales (MP4, MOV, MKV, WEBM), verificación `FFprobe` y generación automática de miniatura.
- `POST /api/v1/uploads/from-url` — Importación desde URL autorizada con validación anti-SSRF.
- `GET /api/v1/uploads/stream/:storageObjectId?sig=...` — Streaming/descarga protegida mediante firma HMAC-SHA256 y aislamiento multiusuario.
- `POST /api/v1/jobs` — Crea y ejecuta un trabajo del pipeline de 20 etapas de AI Clipping.
- `GET /api/v1/jobs/:id` — Consulta el estado y porcentaje real del trabajo junto con los clips producidos.
- `GET /api/v1/jobs/:id/events` — Stream Server-Sent Events (SSE) de progreso en tiempo real.
- `POST /api/v1/jobs/:id/cancel` — Cancelación cooperativa de un trabajo.
- `GET /api/v1/clips` y `GET /api/v1/clips/:id` — Consulta clips con su puntuación de 7 dimensiones.
- `PUT /api/v1/clips/:id/editor` — Guarda una nueva versión no destructiva del editor de video y texto.

## 4. Módulos Avanzados

- `POST /api/v1/find-moments` — Búsqueda semántica y visual sobre `pgvector` (`<=>`).
- `GET /api/v1/gaming` — Eventos y presets de Game Clipping.
- `GET /api/v1/live` y `POST /api/v1/live` — Control de sesiones Live Clipper RTMP (`START`, `STOP`, `MARK_MOMENT`).
- `GET /api/v1/montages` y `POST /api/v1/montages` — Creación de AI Montages.
- `POST /api/v1/exports` — Renderizado en servidor con `FFmpeg` H.264 + AAC en 720p/1080p/1440p/4K y relaciones `9:16`, `16:9`, `1:1`, `4:5`.
