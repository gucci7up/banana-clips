/**
 * BANANA CLIPS AI STUDIO — Comprehensive Integration, Security, RBAC & Real FFmpeg Pipeline Suite
 * Verifies every mandatory requirement from Section 32 & Section 36 of the Master Prompt.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { createBananaApiApp } from '../../apps/api/src/app';
import { ensureFixtureVideo, probeMediaWithFfprobe } from '../../workers/src/pipeline-engine';

async function runIntegrationSuite() {
  console.log('==================================================================');
  console.log(' BANANA CLIPS AI STUDIO — INTEGRATION, SECURITY & PIPELINE SUITE');
  console.log('==================================================================');

  process.env.USE_EMBEDDED_DB = 'true';
  process.env.ADMIN_USERNAME = 'admin';
  process.env.ADMIN_EMAIL = 'admin@bananaclips.local';
  process.env.ADMIN_INITIAL_PASSWORD = 'ChangeMe_BananaStudio_2026!';

  const app = await createBananaApiApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}/api/v1`;

  // Create real licensed test fixture MP4 video
  const fixtureDir = path.resolve(__dirname, '../fixtures');
  fs.mkdirSync(fixtureDir, { recursive: true });
  const sampleVideoPath = path.join(fixtureDir, 'banana_test_fixture.mp4');
  ensureFixtureVideo(sampleVideoPath, 24);

  const callJson = async (
    endpoint: string,
    options: { method?: string; token?: string; body?: any } = {}
  ) => {
    const headers: Record<string, string> = {};
    if (options.token) headers['Authorization'] = `Bearer ${options.token}`;
    if (options.body && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method: options.method || 'GET',
      headers,
      body:
        options.body instanceof FormData
          ? options.body
          : options.body
          ? JSON.stringify(options.body)
          : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  };

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Block Public Self-Registration
    // -------------------------------------------------------------------------
    const regAttempt = await callJson('/auth/register', {
      method: 'POST',
      body: { username: 'hacker', password: 'Password123!' },
    });
    assert.strictEqual(regAttempt.status, 403, 'El registro público debe estar bloqueado con 403');
    console.log('[PASS] 1. Bloqueo de autorregistro público verificado (HTTP 403).');

    // -------------------------------------------------------------------------
    // TEST 2: Initial SUPER_ADMIN Login
    // -------------------------------------------------------------------------
    const adminLogin = await callJson('/auth/login', {
      method: 'POST',
      body: { identifier: 'admin', password: 'ChangeMe_BananaStudio_2026!' },
    });
    assert.strictEqual(adminLogin.status, 200, 'SUPER_ADMIN debe poder iniciar sesión');
    assert.strictEqual(adminLogin.data.user.role, 'SUPER_ADMIN');
    const adminToken = adminLogin.data.accessToken as string;
    console.log('[PASS] 2. Inicio de sesión de SUPER_ADMIN inicial exitoso.');

    // -------------------------------------------------------------------------
    // TEST 3: Protection against disabling or deleting the last SUPER_ADMIN
    // -------------------------------------------------------------------------
    const disableLastAdmin = await callJson(`/users/${adminLogin.data.user.id}`, {
      method: 'PATCH',
      token: adminToken,
      body: { status: 'DISABLED' },
    });
    assert.strictEqual(
      disableLastAdmin.status,
      400,
      'No debe permitir desactivar al último SUPER_ADMIN activo'
    );
    const deleteLastAdmin = await callJson(`/users/${adminLogin.data.user.id}`, {
      method: 'DELETE',
      token: adminToken,
    });
    assert.strictEqual(
      deleteLastAdmin.status,
      400,
      'No debe permitir eliminar al último SUPER_ADMIN activo'
    );
    console.log('[PASS] 3. Protección contra eliminación/desactivación del último SUPER_ADMIN verificada.');

    // -------------------------------------------------------------------------
    // TEST 4: Admin Creates Users + Mandatory Initial Password Change
    // -------------------------------------------------------------------------
    const uniqueSuffix = Date.now();
    const user1Username = `creador_${uniqueSuffix}`;
    const user2Username = `editor_${uniqueSuffix}`;

    const createUser1 = await callJson('/users', {
      method: 'POST',
      token: adminToken,
      body: {
        fullName: 'Creador Uno',
        username: user1Username,
        email: `${user1Username}@bananaclips.local`,
        temporaryPassword: 'TempPassword_2026!',
        role: 'USER',
        status: 'ACTIVE',
        limits: { maxConcurrentJobs: 2, maxFileSizeMb: 500, maxVideoDurationSeconds: 120, maxStorageGb: 10 },
      },
    });
    assert.strictEqual(createUser1.status, 201);
    assert.strictEqual(createUser1.data.mustChangePassword, true);
    const user1Id = createUser1.data.id;

    const createUser2 = await callJson('/users', {
      method: 'POST',
      token: adminToken,
      body: {
        fullName: 'Editor Dos',
        username: user2Username,
        temporaryPassword: 'TempPassword_2026!',
        role: 'USER',
      },
    });
    assert.strictEqual(createUser2.status, 201);

    // Login with User 1 (Temporary password)
    const user1Login = await callJson('/auth/login', {
      method: 'POST',
      body: { identifier: user1Username, password: 'TempPassword_2026!' },
    });
    assert.strictEqual(user1Login.status, 200);
    assert.strictEqual(user1Login.data.user.mustChangePassword, true);
    let user1Token = user1Login.data.accessToken as string;

    // Complete mandatory password change
    const pwdChange = await callJson('/auth/change-password', {
      method: 'POST',
      token: user1Token,
      body: { currentPassword: 'TempPassword_2026!', newPassword: 'NewPermanentPassword_2026!' },
    });
    assert.strictEqual(pwdChange.status, 200);
    assert.strictEqual(pwdChange.data.mustChangePassword, false);
    user1Token = pwdChange.data.accessToken;
    console.log('[PASS] 4. Creación manual de usuario y cambio obligatorio de contraseña inicial verificados.');

    // -------------------------------------------------------------------------
    // TEST 5: Protection of Administrative Routes from Standard USER
    // -------------------------------------------------------------------------
    const userAdminAttempt = await callJson('/users', { token: user1Token });
    assert.strictEqual(userAdminAttempt.status, 403, 'USER no debe acceder a /api/v1/users');
    const userCreateAttempt = await callJson('/users', {
      method: 'POST',
      token: user1Token,
      body: { fullName: 'X', username: 'x', temporaryPassword: 'Password123!' },
    });
    assert.strictEqual(userCreateAttempt.status, 403, 'USER no debe poder crear usuarios');
    console.log('[PASS] 5. Protección RBAC de rutas administrativas verificada (HTTP 403).');

    // -------------------------------------------------------------------------
    // TEST 6: SSRF Protection & Invalid URL Rejection
    // -------------------------------------------------------------------------
    const ssrfLocalhost = await callJson('/uploads/from-url', {
      method: 'POST',
      token: user1Token,
      body: { url: 'http://127.0.0.1:8000/health' },
    });
    assert.strictEqual(ssrfLocalhost.status, 400, 'SSRF a 127.0.0.1 debe ser bloqueado');

    const ssrfMetadata = await callJson('/uploads/from-url', {
      method: 'POST',
      token: user1Token,
      body: { url: 'http://169.254.169.254/latest/meta-data/' },
    });
    assert.strictEqual(ssrfMetadata.status, 400, 'SSRF a IP link-local metadata debe ser bloqueado');
    console.log('[PASS] 6. Protección SSRF e invalidación de URLs internas verificada.');

    // -------------------------------------------------------------------------
    // TEST 7: Corrupted / Fake Media File Rejection (MIME Magic Bytes & FFprobe)
    // -------------------------------------------------------------------------
    const corruptedPath = path.join(fixtureDir, 'corrupted_fake.mp4');
    fs.writeFileSync(corruptedPath, 'NOT_A_REAL_MP4_BINARY_STREAM_JUST_TEXT');
    const badForm = new FormData();
    badForm.append('file', new Blob([fs.readFileSync(corruptedPath)]), 'corrupted_fake.mp4');

    const badUpload = await callJson('/uploads/video', {
      method: 'POST',
      token: user1Token,
      body: badForm,
    });
    assert.strictEqual(badUpload.status, 400, 'Archivo dañado/falso debe ser rechazado');
    console.log('[PASS] 7. Rechazo de archivo dañado mediante magic bytes y FFprobe verificado.');

    // -------------------------------------------------------------------------
    // TEST 8: Real MP4 Upload -> MinIO/Storage -> AI Clipping Job -> Clips -> FFprobe Validation
    // -------------------------------------------------------------------------
    const validForm = new FormData();
    validForm.append(
      'file',
      new Blob([fs.readFileSync(sampleVideoPath)], { type: 'video/mp4' }),
      'charla_podcast_gaming.mp4'
    );
    validForm.append('title', 'Podcast IA y Fortnite Highlights');

    const uploadRes = await callJson('/uploads/video', {
      method: 'POST',
      token: user1Token,
      body: validForm,
    });
    assert.strictEqual(uploadRes.status, 201, 'Subida de MP4 real debe responder 201');
    const uploadedVideo = uploadRes.data.video;
    assert.ok(uploadedVideo.id);
    assert.ok(uploadedVideo.metadata.durationSeconds >= 20);

    // Run full 20-stage AI Clipping Job
    const jobRes = await callJson('/jobs', {
      method: 'POST',
      token: user1Token,
      body: {
        videoId: uploadedVideo.id,
        jobType: 'AI_CLIPPING',
        targetDurationSec: 15,
        aspectRatio: '9:16',
        gameId: 'fortnite',
        syncExecution: true,
      },
    });
    assert.strictEqual(jobRes.status, 201);
    assert.strictEqual(jobRes.data.result.status, 'COMPLETED');
    assert.ok(jobRes.data.result.clipsCreated >= 2, 'Debe producir múltiples clips candidatos');

    // Fetch generated clips & validate score breakdown
    const clipsList = await callJson('/clips', { token: user1Token });
    assert.strictEqual(clipsList.status, 200);
    assert.ok(clipsList.data.clips.length >= 2);
    const firstClip = clipsList.data.clips[0];
    assert.ok(firstClip.scoreTotal >= 50 && firstClip.scoreTotal <= 100);
    assert.ok(firstClip.explanation.includes('puntuación'));

    // Download the rendered clip via signed URL and verify with FFprobe that it is a valid playable 9:16 H.264 MP4
    const dlRes = await fetch(`http://127.0.0.1:${addr.port}${firstClip.signedDownloadUrl}`);
    assert.strictEqual(dlRes.status, 200, 'Descarga mediante URL firmada debe responder 200');
    const downloadedBuffer = Buffer.from(await dlRes.arrayBuffer());
    const downloadedClipPath = path.join(fixtureDir, 'downloaded_verified_clip.mp4');
    fs.writeFileSync(downloadedClipPath, downloadedBuffer);

    const verifiedClipMeta = probeMediaWithFfprobe(downloadedClipPath);
    assert.strictEqual(verifiedClipMeta.videoCodec, 'h264');
    assert.strictEqual(verifiedClipMeta.aspectRatio, '9:16');
    assert.ok(verifiedClipMeta.durationSeconds > 1.0);
    console.log(
      `[PASS] 8. Pipeline completo AI Clipping y verificación FFprobe del MP4 descargado (${verifiedClipMeta.width}x${verifiedClipMeta.height}, ${verifiedClipMeta.videoCodec}, ${verifiedClipMeta.durationSeconds}s).`
    );

    // -------------------------------------------------------------------------
    // TEST 9: Find Moments (pgvector Semantic & Visual Search)
    // -------------------------------------------------------------------------
    const findLaugh = await callJson('/find-moments', {
      method: 'POST',
      token: user1Token,
      body: { query: 'Encuentra cuando el presentador se ríe' },
    });
    assert.strictEqual(findLaugh.status, 200);
    assert.ok(findLaugh.data.results.length >= 1, 'Find Moments debe devolver coincidencias vectoriales');
    console.log('[PASS] 9. Búsqueda vectorial Find Moments (pgvector) verificada.');

    // -------------------------------------------------------------------------
    // TEST 10: Non-Destructive Editor & Server-Side FFmpeg 1080p Export
    // -------------------------------------------------------------------------
    const editUpdate = await callJson(`/clips/${firstClip.id}/editor`, {
      method: 'PUT',
      token: user1Token,
      body: {
        stateJson: { aspectRatio: '9:16', speed: 1.0, volume: 1.0, subtitleTemplate: 'Neon' },
        operationType: 'SUBTITLE_STYLE',
      },
    });
    assert.strictEqual(editUpdate.status, 200);
    assert.ok(editUpdate.data.version >= 2);

    const exportRes = await callJson('/exports', {
      method: 'POST',
      token: user1Token,
      body: {
        clipId: firstClip.id,
        preset: 'TikTok',
        resolution: '1080p',
        aspectRatio: '9:16',
      },
    });
    assert.strictEqual(exportRes.status, 201);
    assert.strictEqual(exportRes.data.export.metadata.width, 1080);
    assert.strictEqual(exportRes.data.export.metadata.height, 1920);
    console.log('[PASS] 10. Edición no destructiva y exportación FFmpeg 1080p (1080x1920) verificadas.');

    // -------------------------------------------------------------------------
    // TEST 11: Multi-User Isolation (User 2 cannot access User 1's clips, videos or files)
    // -------------------------------------------------------------------------
    const user2Login = await callJson('/auth/login', {
      method: 'POST',
      body: { identifier: user2Username, password: 'TempPassword_2026!' },
    });
    const user2Token = user2Login.data.accessToken as string;

    const user2AccessUser1Clip = await callJson(`/clips/${firstClip.id}`, { token: user2Token });
    assert.strictEqual(
      user2AccessUser1Clip.status,
      403,
      'Usuario 2 no debe poder consultar un clip privado del Usuario 1'
    );

    const user2StreamUser1File = await fetch(
      `${baseUrl}/uploads/stream/${uploadedVideo.storageObjectId}`,
      { headers: { Authorization: `Bearer ${user2Token}` } }
    );
    assert.strictEqual(
      user2StreamUser1File.status,
      403,
      'Usuario 2 no debe poder descargar el archivo de almacenamiento del Usuario 1'
    );
    console.log('[PASS] 11. Aislamiento estricto multiusuario de proyectos y archivos verificado (HTTP 403).');

    // -------------------------------------------------------------------------
    // TEST 12: Cooperative Job Cancellation, Session Revocation & Account Deactivation
    // -------------------------------------------------------------------------
    const cancelableJob = await callJson('/jobs', {
      method: 'POST',
      token: user1Token,
      body: { videoId: uploadedVideo.id, syncExecution: false },
    });
    const cancelRes = await callJson(`/jobs/${cancelableJob.data.jobId}/cancel`, {
      method: 'POST',
      token: user1Token,
    });
    assert.strictEqual(cancelRes.status, 200);
    assert.strictEqual(cancelRes.data.status, 'CANCELED');

    // Admin revokes User 1 sessions
    const revokeRes = await callJson(`/users/${user1Id}/revoke-sessions`, {
      method: 'POST',
      token: adminToken,
    });
    assert.strictEqual(revokeRes.status, 200);

    const user1AfterRevoke = await callJson('/dashboard', { token: user1Token });
    assert.strictEqual(
      user1AfterRevoke.status,
      401,
      'Token de sesión revocada debe ser rechazado inmediatamente con 401'
    );

    // Admin disables User 1 account
    await callJson(`/users/${user1Id}`, {
      method: 'PATCH',
      token: adminToken,
      body: { status: 'DISABLED' },
    });
    const disabledLoginAttempt = await callJson('/auth/login', {
      method: 'POST',
      body: { identifier: user1Username, password: 'NewPermanentPassword_2026!' },
    });
    assert.strictEqual(
      disabledLoginAttempt.status,
      403,
      'Cuenta desactivada no debe poder iniciar sesión'
    );
    console.log('[PASS] 12. Cancelación de jobs, revocación de sesión y desactivación de cuenta verificadas.');

    console.log('==================================================================');
    console.log(' ALL 12 INTEGRATION & REAL MULTIMEDIA PIPELINE SUITES PASSED!');
    console.log('==================================================================');
  } finally {
    server.close();
  }
}

runIntegrationSuite().catch((err) => {
  console.error('INTEGRATION TEST FAILED:', err);
  process.exit(1);
});
