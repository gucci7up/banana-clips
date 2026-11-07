# GUÍA DE TESTING Y VALIDACIÓN — BANANA CLIPS AI STUDIO

## 1. Suites de Pruebas Implementadas

1. **Pruebas Unitarias y de FFmpeg en el Microservicio Python (`apps/ai-service/test_ai_service.py`)**:
   - Verifica detección de perfil de hardware (`NVIDIA GeForce GTX 1070` / `CPU_ONLY`).
   - Verifica similitud coseno en embeddings semánticos de 384 dimensiones.
   - Genera un video MP4 real con `FFmpeg`, ejecuta `FFprobe`, detector de silencios VAD, detector de escenas `scdet` y detector de eventos de Fortnite.

2. **Suite Completa de Integración, Seguridad, RBAC y Pipeline Real (`tests/integration/run-integration-tests.ts`)**:
   - Bloqueo de registro público (`403`).
   - Login del `SUPER_ADMIN` inicial creado por bootstrap idempotente.
   - Protección contra eliminación o desactivación del último `SUPER_ADMIN`.
   - Creación manual de usuarios por el administrador y cambio obligatorio de contraseña temporal en el primer inicio de sesión.
   - Bloqueo de rutas administrativas para usuarios con rol `USER` (`403`).
   - Protección contra ataques SSRF (`127.0.0.1` y `169.254.169.254`) e invalidación de archivos corruptos/falsos mediante magic bytes.
   - Flujo completo con video MP4 real: subida → almacenamiento → creación de job → transcripción → segmentación → escenas → scoring de 7 dimensiones → renderizado de múltiples clips MP4 → descarga mediante URL firmada → validación final del MP4 descargado con `FFprobe` (`h264`, `9:16`).
   - Búsqueda semántica y visual en `Find Moments` con `pgvector`.
   - Edición no destructiva y exportación en servidor `1080p` (`1080x1920`).
   - Aislamiento estricto multiusuario (`403` cuando un usuario intenta acceder a clips o archivos de otro usuario).
   - Cancelación cooperativa de jobs, revocación de sesiones (`401`) y desactivación de cuentas (`403`).

3. **Pruebas End-to-End con Playwright (`tests/e2e/banana-studio.spec.ts`)**:
   - Recorre el flujo completo en navegador desde `/login` → `/dashboard` → `/admin/users` → `/ai-clipping` → `/find-moments` → `/editor` → exportación MP4.
