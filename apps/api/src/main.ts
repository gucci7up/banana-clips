import { createBananaApiApp } from './app';

async function bootstrap() {
  const port = Number(process.env.API_PORT || 4000);
  const app = await createBananaApiApp();
  app.listen(port, '0.0.0.0', () => {
    console.log(`[BANANA CLIPS API] Servidor activo en http://0.0.0.0:${port}/api/v1`);
    console.log(`[BANANA CLIPS API] Documentación OpenAPI en http://0.0.0.0:${port}/api/v1/openapi.json`);
  });
}

if (require.main === module) {
  bootstrap().catch((err) => {
    console.error('[BANANA CLIPS API] Error fatal en inicio:', err);
    process.exit(1);
  });
}
