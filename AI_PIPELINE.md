# PIPELINE MULTIMEDIA Y DE INTELIGENCIA ARTIFICIAL — BANANA CLIPS AI STUDIO

## 1. Las 20 Etapas del Motor de AI Clipping

1. **Ingesta del video**: Almacenamiento seguro en bucket `banana-videos` tras validar magic bytes binarios.
2. **Verificación con FFprobe**: Extracción de duración exacta, resolución, FPS, códecs de video/audio y bitrate.
3. **Normalización de audio**: Ajuste de nivel acústico para análisis uniforme.
4. **Detección de actividad de voz (VAD)**: Identificación de intervalos de habla activa y silencios mediante `Silero VAD` / `FFmpeg silencedetect`.
5. **Transcripción**: Transcripción local con `Faster-Whisper` (`es`, `en`, autodetección) y timestamps por palabra.
6. **Segmentación por frases**: Agrupación respetando límites naturales de puntuación para evitar cortes abruptos.
7. **Detección de escenas**: Identificación de cambios de plano mediante `PySceneDetect` y filtro `scdet` de `FFmpeg`.
8. **Análisis visual**: Cálculo de dinamismo visual (`motionScore`), picos acústicos y conteo de rostros en escena.
9. **Análisis semántico (`pgvector`)**: Generación de embeddings multilingües normalizados de 384 dimensiones almacenados en PostgreSQL (`vector(384)`).
10. **Detección de momentos relevantes**: Fusión de señales acústicas, semánticas y visuales.
11. **Construcción de clips candidatos**: Selección de ventanas temporales de 15s, 30s, 45s, 60s, 90s o personalizada con introducción, gancho, desarrollo y cierre natural.
12. **Evaluación de calidad (0-100)**: Cálculo heurístico configurable en 7 dimensiones (`HOOK`, `STORY`, `EMOTION`, `ENGAGEMENT`, `CLARITY`, `VISUAL_IMPACT`, `SHAREABILITY`) con explicación textual.
13. **Eliminación de duplicados**: Huella `fingerprintHash` MD5 sobre rango temporal y transcripción para descartar clips solapados.
14. **Ranking**: Ordenamiento descendente por `score_total`.
15. **Generación de títulos**: Título principal y título alternativo basados estrictamente en el contenido real del segmento.
16. **Generación de descripciones**: Resumen contextual sin inventar hechos externos.
17. **Generación de hashtags y palabras clave**: Etiquetas relevantes según categoría e idioma.
18. **Renderización de clips**: Codificación real con `FFmpeg` (`libx264`, `yuv420p`, `aac`, `+faststart`) y Auto-Reframe (`9:16`, `1:1`, `4:5`, `16:9`).
19. **Generación de previews y thumbnails**: Extracción automática de miniaturas JPEG y archivos de vista previa.
20. **Almacenamiento de resultados**: Persistencia en `MinIO` / volúmenes y registro transaccional en PostgreSQL.
