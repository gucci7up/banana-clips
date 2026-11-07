# GUÍA DE DESPLIEGUE EN DOKPLOY — BANANA CLIPS AI STUDIO

## 1. Requisitos del Servidor Dokploy

- **Sistema Operativo**: Ubuntu 24.04 LTS.
- **Gestor**: Dokploy instalado con Traefik activo en los puertos 80/443 y red externa `dokploy-network`.
- **Almacenamiento**: Volúmenes Docker persistentes (`banana_postgres_data`, `banana_redis_data`, `banana_minio_data`, `banana_models_cache`, `banana_media_storage`).

## 2. Pasos para Importar el Proyecto en Dokploy (Docker Compose)

1. En el panel de **Dokploy**, crea un nuevo proyecto llamado `banana-clips-ai-studio`.
2. Selecciona el tipo de servicio **Compose** (`docker-compose.yml`).
3. Conecta tu repositorio Git privado.
4. En la pestaña **Environment** de Dokploy, pega el contenido de `.env.example` y personaliza:
   - `ADMIN_USERNAME`, `ADMIN_EMAIL`, `ADMIN_INITIAL_PASSWORD`
   - `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY_HEX`
   - `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `MINIO_ROOT_PASSWORD`
   - `PUBLIC_APP_URL` y `PUBLIC_API_URL` con tus dominios en Traefik.
5. Si el servidor cuenta con GPU NVIDIA, configura en Dokploy el archivo Compose combinado:
   - `docker-compose.yml` + `docker-compose.gpu.yml`
   Si el servidor es únicamente CPU, utiliza:
   - `docker-compose.yml` + `docker-compose.cpu.yml`
6. Pulsa **Deploy**.

## 3. Ejecución de Migraciones y Bootstrap en Despliegues

Durante el arranque del contenedor `api`, el sistema ejecuta automáticamente:
1. Verificación y aplicación de la migración SQL reproducible (`20261106000000_init/migration.sql`) con la extensión `vector` (`pgvector`).
2. Bootstrap idempotente del `SUPER_ADMIN` inicial (solo si no existe ningún administrador previo, preservando las credenciales existentes en futuros reinicios).
3. Carga de plantillas de subtítulos, plantillas de montaje y configuración inicial de workers.

## 4. Respaldos y Restauración

- **Crear respaldo completo (PostgreSQL + MinIO)**:
  ```bash
  ./infrastructure/scripts/backup.sh
  ```
- **Restaurar desde un respaldo**:
  ```bash
  ./infrastructure/scripts/restore.sh ./backups/20261106_200000
  ```
