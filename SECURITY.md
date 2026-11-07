# SEGURIDAD Y CONTROL DE ACCESO PRIVADO — BANANA CLIPS AI STUDIO

## 1. Política de Plataforma Privada

- **Sin Registro Público**: Los endpoints `/api/v1/auth/register` y `/api/v1/auth/signup` devuelven `HTTP 403 Forbidden` y generan una alerta en `AuditLog`. La interfaz de login no contiene botones de "Crear cuenta" ni inicio de sesión social.
- **Sin Monetización Comercial**: No existen pasarelas de pago, planes, suscripciones ni billeteras. El control de uso se gestiona mediante cuotas técnicas configurables por el `SUPER_ADMIN` (`UserResourceLimit`).

## 2. Controles Criptográficos y de Sesión

- **Hash de Contraseñas**: Derivación con memoria endurecida (`scrypt`/`Argon2id` PHC format) y salt único de 16 bytes por usuario.
- **Tokens**: `accessToken` JWT de corta duración + `refreshToken` rotativo almacenado como hash SHA-256 en la tabla `Session` y entregado en cookies `HttpOnly`.
- **Protección contra Fuerza Bruta**: Bloqueo temporal automático de la cuenta tras 5 intentos fallidos de inicio de sesión (`lockedUntil`), registrando cada intento en `AuditLog`.
- **Revocación Instantánea**: El `SUPER_ADMIN` puede revocar todas las sesiones de un usuario o desactivar su cuenta con efecto inmediato en cada petición autenticada.
- **Protección del Último Administrador**: El backend impide eliminar, desactivar o quitar el rol `SUPER_ADMIN` si solo queda un administrador activo en la base de datos.

## 3. Seguridad Multimedia y de Red

- **Validación de Magic Bytes Reales**: Se inspeccionan los primeros 32 bytes binarios de cada archivo subido (`ftyp`/`moov` para MP4/MOV y cabecera EBML `0x1A45DFA3` para MKV/WEBM) antes de invocar `FFprobe`.
- **Protección Anti-SSRF**: `validateSafeExternalUrl` bloquea `localhost`, `127.0.0.1`, `0.0.0.0`, `::1`, `169.254.169.254` (metadatos cloud) y todos los rangos privados RFC1918 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
- **Aislamiento Multiusuario y URLs Firmadas**: Cada archivo privado se sirve mediante tokens firmados con `HMAC-SHA256` vinculados al `userId` propietario y con tiempo de expiración (`SIGNED_URL_TTL_SECONDS`). Ningún usuario puede descargar ni consultar videos, clips o proyectos de otro usuario manipulando UUIDs.
