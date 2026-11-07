# BANANA CLIPS AI STUDIO

Plataforma web privada y profesional de clipping con inteligencia artificial, edición no destructiva basada en texto y timeline, reencuadre automático (Auto-Reframe), subtitulado dinámico ASS/SRT/VTT, búsqueda semántica y visual con `pgvector` (**Find Moments**), **Game Clipping** y **Live Clipper**.

Diseñada para desplegarse y administrarse íntegramente dentro de **Dokploy** sin depender de APIs comerciales externas ni incluir registro público, pagos o suscripciones.

---

## 1. Características Principales

1. **AI Clipping (Pipeline Real de 20 Etapas)**:
   - Ingesta multimedia → Inspección con `FFprobe` → Normalización acústica → Detección de actividad de voz (`Silero VAD` / `silencedetect`) → Transcripción con `Faster-Whisper` → Segmentación natural por frases → Detección de escenas (`PySceneDetect` / `scdet`) → Análisis visual → Embeddings vectoriales 384-d → Detección de momentos relevantes → Construcción de clips candidatos → Evaluación de calidad en **7 dimensiones (0-100)** → Eliminación de duplicados por huella → Ranking → Generación local de títulos, descripciones y hashtags → Renderización `FFmpeg` H.264/AAC → Previews y miniaturas → Almacenamiento en `MinIO` / Volumen persistente.
2. **Sistema de Puntuación de Calidad (0-100)**:
   - Evalúa `HOOK`, `STORY`, `EMOTION`, `ENGAGEMENT`, `CLARITY`, `VISUAL_IMPACT` y `SHAREABILITY`, almacenando la explicación textual, versión del algoritmo y pesos en PostgreSQL.
3. **Find Moments (Búsqueda Semántica y Visual con `pgvector`)**:
   - Búsqueda en lenguaje natural sobre transcripciones, eventos y descripciones visuales de escenas utilizando similitud coseno vectorial `vector(384)`.
4. **Game Clipping**:
   - Detectores modulares intercambiables para Fortnite, GTA V, GTA VI (preparado), Valorant, Minecraft, Call of Duty y deportes, con presets (*Funny Moments*, *Epic Wins*, *Rage Moments*, *Best Plays*, *Fails*, *Reactions*, *Highlights*) y timeline interactivo.
5. **Live Clipper**:
   - Grabación progresiva de transmisiones RTMP/HLS autorizadas, marcadores manuales y automáticos en directo y recorte asíncrono.
6. **AI Auto Reframe (3 Niveles)**:
   - Conversión `16:9` → `9:16`, `1:1`, `4:5` y `9:16` → `16:9` con seguimiento visual y modo *Split Screen* para entrevistas o webcam de gaming.
7. **Subtítulos Automáticos y 9 Plantillas**:
   - Exportación `.SRT`, `.VTT` y quemado reproducible mediante `ASS/libass` con resaltado de palabra activa (*Classic*, *Bold*, *Neon*, *Minimal*, *Gaming*, *Podcast*, *Karaoke*, *Dynamic*, *Premium*).
8. **Editor de Video No Destructivo y Text-Based Editing**:
   - Timeline editable con historial Deshacer/Rehacer versionado en PostgreSQL y edición por párrafos/palabras sincronizadas.
9. **Sistema de Acceso Privado y Control Administrativo de Recursos**:
   - **Sin registro público ni pagos**. Solo acceden el `SUPER_ADMIN` y las cuentas `USER` creadas manualmente desde `/admin/users`, con cambio obligatorio de contraseña temporal en el primer acceso.

---

## 2. Requisitos Mínimos

- **Servidor de Producción (Dokploy)**: Ubuntu 24.04 LTS, Docker 26+, Docker Compose v2, Traefik (incluido en Dokploy), 4+ vCPU, 8 GB RAM (16 GB recomendados), GPU NVIDIA opcional (compatible desde 4 GB VRAM en perfil `NVIDIA_LOW_VRAM` o modo `CPU_ONLY`).
- **Desarrollo Local**: Node.js 20/22+, Python 3.11+, FFmpeg / FFprobe 6+.

---

## 3. Instalación Local y Desarrollo

```bash
# 1. Clonar el repositorio y copiar variables de entorno
cp .env.example .env

# 2. Instalar dependencias del monorepo
npm install

# 3. Inicializar base de datos y bootstrap idempotente del SUPER_ADMIN
npm run db:seed

# 4. Iniciar servicios en desarrollo
npm run dev:api
npm run dev:web
```

---

## 4. Comandos Principales

- `npm run build` — Compila todos los paquetes y aplicaciones del monorepo.
- `npx tsx tests/integration/run-integration-tests.ts` — Ejecuta la suite completa de integración, seguridad, RBAC y renderizado real con `FFmpeg`/`FFprobe`.
- `npx playwright test` — Ejecuta las pruebas End-to-End en navegador con Playwright.
- `python -m pytest apps/ai-service/test_ai_service.py` — Ejecuta las pruebas del microservicio de IA y análisis multimedia en Python.

---

## 5. Creación del Administrador Inicial y Gestión de Usuarios

1. Antes del primer despliegue, define en `.env`:
   - `ADMIN_USERNAME`
   - `ADMIN_EMAIL`
   - `ADMIN_INITIAL_PASSWORD`
2. Al iniciar el backend, el bootstrap idempotente crea automáticamente el rol `SUPER_ADMIN` y el usuario administrador inicial sin escribir nunca la contraseña en los logs ni sobrescribir credenciales en reinicios posteriores.
3. Para crear usuarios adicionales, inicia sesión como `SUPER_ADMIN`, navega a `/admin/users` y pulsa **"Nuevo usuario"**. Asigna una contraseña temporal segura; el sistema obligará al usuario a cambiarla en su primer inicio de sesión.

---

## 6. Documentación Detallada

- [ARCHITECTURE.md](file:///e:/Apps%20news/Banana%20Clips/ARCHITECTURE.md)
- [DATABASE.md](file:///e:/Apps%20news/Banana%20Clips/DATABASE.md)
- [API.md](file:///e:/Apps%20news/Banana%20Clips/API.md)
- [AI_PIPELINE.md](file:///e:/Apps%20news/Banana%20Clips/AI_PIPELINE.md)
- [DOKPLOY_DEPLOYMENT.md](file:///e:/Apps%20news/Banana%20Clips/DOKPLOY_DEPLOYMENT.md)
- [GPU_SETUP.md](file:///e:/Apps%20news/Banana%20Clips/GPU_SETUP.md)
- [SECURITY.md](file:///e:/Apps%20news/Banana%20Clips/SECURITY.md)
- [TESTING.md](file:///e:/Apps%20news/Banana%20Clips/TESTING.md)
- [PROJECT_STATUS.md](file:///e:/Apps%20news/Banana%20Clips/PROJECT_STATUS.md)
