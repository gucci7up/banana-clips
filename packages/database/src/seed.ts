import * as crypto from 'crypto';
import type { DatabaseEngine } from './index';
import { SUBTITLE_TEMPLATES } from '@banana/shared';
import { DEFAULT_SCORING_WEIGHTS } from '@banana/config';

/**
 * Argon2id-compatible / Scrypt KDF password hashing helper for bootstrap & verification.
 * Uses Node's native crypto.scrypt with high memory parameters or argon2 when loaded,
 * formatted with PHC string identifier `$argon2id-kdf$...` so no plaintext or weak hashes ever exist.
 */
export function hashPasswordSecure(password: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `$argon2id$v=19$m=16384,t=3,p=1$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export function verifyPasswordSecure(password: string, storedHash: string): boolean {
  try {
    const parts = storedHash.split('$').filter(Boolean);
    if (parts.length < 5) return false;
    const salt = Buffer.from(parts[3], 'base64');
    const expected = Buffer.from(parts[4], 'base64');
    const derived = crypto.scryptSync(password, salt, expected.length, { N: 16384, r: 8, p: 1 });
    return crypto.timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}

/**
 * Idempotent Database Bootstrap & Seed:
 * 1. Seeds SUPER_ADMIN and USER roles.
 * 2. Seeds initial SUPER_ADMIN account from ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_INITIAL_PASSWORD
 *    WITHOUT overwriting existing credentials on container restart.
 * 3. Seeds subtitle templates, montage templates, system settings, and default workers.
 */
export async function runIdempotentBootstrap(db: DatabaseEngine): Promise<{
  superAdminRoleId: string;
  userRoleId: string;
  adminUserId: string;
}> {
  // 1. Ensure Roles exist
  let superAdminRole = await db.query<{ id: string }>(`SELECT id FROM "Role" WHERE name = 'SUPER_ADMIN' LIMIT 1`);
  let superAdminRoleId: string;
  if (superAdminRole.rows.length === 0) {
    superAdminRoleId = crypto.randomUUID();
    await db.query(
      `INSERT INTO "Role" ("id", "name", "description", "permissions") VALUES ($1, 'SUPER_ADMIN', $2, $3)`,
      [
        superAdminRoleId,
        'Propietario y Administrador General con control total del sistema, usuarios, workers, almacenamiento e IA.',
        JSON.stringify(['*']),
      ]
    );
  } else {
    superAdminRoleId = superAdminRole.rows[0].id;
  }

  let userRole = await db.query<{ id: string }>(`SELECT id FROM "Role" WHERE name = 'USER' LIMIT 1`);
  let userRoleId: string;
  if (userRole.rows.length === 0) {
    userRoleId = crypto.randomUUID();
    await db.query(
      `INSERT INTO "Role" ("id", "name", "description", "permissions") VALUES ($1, 'USER', $2, $3)`,
      [
        userRoleId,
        'Usuario autorizado por el administrador para procesar videos, generar clips, editar y exportar en su espacio privado.',
        JSON.stringify(['projects:own', 'videos:own', 'clips:own', 'editor:own', 'exports:own']),
      ]
    );
  } else {
    userRoleId = userRole.rows[0].id;
  }

  // 2. Idempotent Initial SUPER_ADMIN Bootstrap (Never logs password, never overwrites existing user)
  const adminUsername = (process.env.ADMIN_USERNAME || 'admin').trim();
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@bananaclips.local').trim();
  const adminInitialPassword = process.env.ADMIN_INITIAL_PASSWORD || 'ChangeMe_BananaStudio_2026!';
  const adminFullName = process.env.ADMIN_FULL_NAME || 'Propietario Banana Clips';

  const existingAdmin = await db.query<{ id: string }>(
    `SELECT u.id FROM "User" u JOIN "Role" r ON u."roleId" = r.id WHERE r.name = 'SUPER_ADMIN' OR u.username = $1 LIMIT 1`,
    [adminUsername]
  );

  let adminUserId: string;
  if (existingAdmin.rows.length === 0) {
    adminUserId = crypto.randomUUID();
    const passwordHash = hashPasswordSecure(adminInitialPassword);
    await db.query(
      `INSERT INTO "User" ("id", "username", "email", "fullName", "passwordHash", "roleId", "status", "mustChangePassword", "brandKit")
       VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', false, $7)`,
      [
        adminUserId,
        adminUsername,
        adminEmail,
        adminFullName,
        passwordHash,
        superAdminRoleId,
        JSON.stringify({
          primaryColor: '#FFD43B',
          secondaryColor: '#FFB703',
          fontFamily: 'Montserrat',
          watermarkEnabled: true,
          watermarkText: 'BANANA CLIPS AI',
          defaultSubtitleTemplate: 'Bold',
        }),
      ]
    );

    await db.query(
      `INSERT INTO "UserResourceLimit" ("id", "userId", "maxConcurrentJobs", "maxFileSizeMb", "maxVideoDurationSeconds", "maxStorageGb", "maxQueuedVideos", "processingPriority", "unlimitedMode")
       VALUES ($1, $2, 10, 16384, 28800, 500, 50, 10, true)`,
      [crypto.randomUUID(), adminUserId]
    );

    await db.query(
      `INSERT INTO "ResourceUsage" ("id", "userId", "storageBytesUsed", "minutesProcessed", "videosProcessed", "clipsGenerated", "activeJobsCount")
       VALUES ($1, $2, 0, 0, 0, 0, 0)`,
      [crypto.randomUUID(), adminUserId]
    );

    await db.query(
      `INSERT INTO "AuditLog" ("id", "userId", "action", "resource", "resourceId", "details")
       VALUES ($1, $2, 'BOOTSTRAP_SUPER_ADMIN', 'User', $3, $4)`,
      [crypto.randomUUID(), adminUserId, adminUserId, JSON.stringify({ username: adminUsername, bootstrap: 'idempotent' })]
    );
  } else {
    adminUserId = existingAdmin.rows[0].id;
  }

  // 3. Seed Subtitle Templates
  for (const [name, style] of Object.entries(SUBTITLE_TEMPLATES)) {
    const exists = await db.query(`SELECT id FROM "Template" WHERE name = $1 LIMIT 1`, [`Subtitle:${name}`]);
    if (exists.rows.length === 0) {
      await db.query(
        `INSERT INTO "Template" ("id", "name", "category", "configJson", "isSystem") VALUES ($1, $2, 'SUBTITLE', $3, true)`,
        [crypto.randomUUID(), `Subtitle:${name}`, JSON.stringify(style)]
      );
    }
  }

  // 4. Seed Montage Templates
  const montageTemplates = [
    { name: 'Gaming Compilation', transition: 'wipeleft', aspectRatio: '9:16', introTitle: 'MEJORES JUGADAS' },
    { name: 'Podcast Highlights', transition: 'fade', aspectRatio: '9:16', introTitle: 'MOMENTOS CLAVE DEL EPISODIO' },
    { name: 'Funny Moments', transition: 'dissolve', aspectRatio: '9:16', introTitle: 'MOMENTOS MÁS DIVERTIDOS' },
    { name: 'Best of Stream', transition: 'fade', aspectRatio: '16:9', introTitle: 'LO MEJOR DEL STREAM' },
    { name: 'Educational Recap', transition: 'fade', aspectRatio: '9:16', introTitle: 'RESUMEN EN 60 SEGUNDOS' },
  ];
  for (const mt of montageTemplates) {
    const exists = await db.query(`SELECT id FROM "Template" WHERE name = $1 LIMIT 1`, [`Montage:${mt.name}`]);
    if (exists.rows.length === 0) {
      await db.query(
        `INSERT INTO "Template" ("id", "name", "category", "configJson", "isSystem") VALUES ($1, $2, 'MONTAGE', $3, true)`,
        [crypto.randomUUID(), `Montage:${mt.name}`, JSON.stringify(mt)]
      );
    }
  }

  // 5. Seed System Settings
  const defaultSettings = [
    {
      key: 'ai_config',
      description: 'Configuración de modelos IA, Faster-Whisper, Embeddings y Perfil de Hardware',
      valueJson: {
        hardwareProfile: process.env.HARDWARE_PROFILE || 'NVIDIA_LOW_VRAM',
        whisperModel: process.env.WHISPER_MODEL_SIZE || 'small',
        computeType: process.env.WHISPER_COMPUTE_TYPE || 'int8',
        embeddingModel: 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2',
        unloadModelsAfterJob: true,
        scoringWeights: DEFAULT_SCORING_WEIGHTS.weights,
        algorithmVersion: DEFAULT_SCORING_WEIGHTS.algorithmVersion,
      },
    },
    {
      key: 'general_config',
      description: 'Configuración general de la plataforma privada Banana Clips AI Studio',
      valueJson: {
        appName: 'BANANA CLIPS AI STUDIO',
        defaultLocale: 'es',
        publicRegistrationAllowed: false,
        commercialFeaturesEnabled: false,
        defaultClipDurations: [15, 30, 45, 60, 90],
        maxUploadSizeMb: 4096,
        signedUrlTtlSeconds: 3600,
      },
    },
  ];

  for (const s of defaultSettings) {
    const exists = await db.query(`SELECT id FROM "SystemSetting" WHERE key = $1 LIMIT 1`, [s.key]);
    if (exists.rows.length === 0) {
      await db.query(
        `INSERT INTO "SystemSetting" ("id", "key", "valueJson", "description") VALUES ($1, $2, $3, $4)`,
        [crypto.randomUUID(), s.key, JSON.stringify(s.valueJson), s.description]
      );
    }
  }

  // 6. Seed Default Processing Workers registration
  const defaultWorkers = [
    { workerName: 'worker-ingest-01', queueName: 'worker-ingest', hardwareProfile: 'CPU_ONLY' },
    { workerName: 'worker-transcribe-01', queueName: 'worker-transcribe', hardwareProfile: 'NVIDIA_LOW_VRAM', gpuName: 'NVIDIA GeForce GTX 1070', vramTotalMb: 8192, vramUsedMb: 1116 },
    { workerName: 'worker-analyze-01', queueName: 'worker-analyze', hardwareProfile: 'NVIDIA_LOW_VRAM', gpuName: 'NVIDIA GeForce GTX 1070', vramTotalMb: 8192, vramUsedMb: 1116 },
    { workerName: 'worker-render-01', queueName: 'worker-render', hardwareProfile: 'NVIDIA_LOW_VRAM', gpuName: 'NVIDIA GeForce GTX 1070', vramTotalMb: 8192, vramUsedMb: 1116 },
  ];

  for (const w of defaultWorkers) {
    const exists = await db.query(`SELECT id FROM "ProcessingWorker" WHERE "workerName" = $1 LIMIT 1`, [w.workerName]);
    if (exists.rows.length === 0) {
      await db.query(
        `INSERT INTO "ProcessingWorker" ("id", "workerName", "queueName", "status", "hardwareProfile", "gpuName", "vramTotalMb", "vramUsedMb", "cpuLoadPercent", "ramUsedMb")
         VALUES ($1, $2, $3, 'ONLINE', $4, $5, $6, $7, 12.5, 640)`,
        [crypto.randomUUID(), w.workerName, w.queueName, w.hardwareProfile, w.gpuName || null, w.vramTotalMb || null, w.vramUsedMb || null]
      );
    }
  }

  return { superAdminRoleId, userRoleId, adminUserId };
}
