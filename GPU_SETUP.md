# CONFIGURACIÓN DE HARDWARE Y GPU NVIDIA — BANANA CLIPS AI STUDIO

## 1. Perfiles Soportados

El motor de IA (`apps/ai-service/main.py` y `@banana/config`) detecta automáticamente el hardware disponible mediante `nvidia-smi` y aplica uno de los tres perfiles:

| Perfil | Hardware Objetivo | Modelo Whisper | Precisión / Cuantización | Concurrencia | Descarga de VRAM tras Job |
|---|---|---|---|---|---|
| `CPU_ONLY` | Servidores sin GPU dedicada | `base` | `int8` | 1 | Sí (`true`) |
| `NVIDIA_LOW_VRAM` | GPUs de 4 GB a 8 GB VRAM (ej. GTX 1050 Ti, GTX 1650, GTX 1070, RTX 3050) | `small` | `int8_float16` | 1 | Sí (`true`) |
| `NVIDIA_HIGH_VRAM` | GPUs de 12 GB+ VRAM (ej. RTX 3060 12GB, RTX 4080, L4, A10G) | `large-v3-turbo` | `float16` | 2 | Opcional (`false`) |

## 2. Prevención de Errores OOM en GPUs de 4 GB a 8 GB VRAM

Para evitar agotamiento de memoria de video (VRAM OOM):
- Nunca se cargan simultáneamente el modelo de transcripción y modelos visuales pesados en VRAM.
- Se utiliza cuantización `int8` / `int8_float16` en CTranslate2 (`Faster-Whisper`).
- Al finalizar cada etapa de transcripción, el worker libera explícitamente el modelo de la VRAM (`UNLOAD_MODELS_AFTER_JOB=true`) antes de pasar a la etapa de análisis visual o renderizado `FFmpeg`.
- Si ocurre cualquier fallo de inicialización CUDA, el worker realiza fallback transparente a `CPU_ONLY` y registra el evento en `JobAttempt`.
