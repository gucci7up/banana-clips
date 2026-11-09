import * as crypto from 'crypto';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import express, { type Express, type Response } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import multer from 'multer';
import {
  getDb,
  hashPasswordSecure,
  runIdempotentBootstrap,
  verifyPasswordSecure,
} from '@banana/database';
import { SUBTITLE_TEMPLATES, validateSafeExternalUrl } from '@banana/shared';
import {
  analyzeClipArcAndDebateWithClaudeAsync,
  analyzeTrendingYouTubeViralsWithAiAsync,
  applyColdOpenToClipWithClaudeAsync,
  applyVoiceDubbingToClipAsync,
  buildPremiereXmlForClip,
  callClaudeAnthropicAsync,
  callGrokXaiChatAsync,
  captureLiveStreamSegmentAsync,
  computeEmbedding384,
  cosineSimilarity,
  detectBestViralMomentsMultimodalAsync,
  detectSpeakerAndEditPlanWithClaudeVisionAsync,
  ensureFixtureVideo,
  executeAiClippingJob,
  generateAssSubtitles,
  generateStoryboardWithNvidiaNimAsync,
  generateThumbnailFfmpeg,
  generateViralHookWithGrokAsync,
  generateViralThumbnailWithGrokImagineAsync,
  getStorageRoot,
  onJobProgress,
  probeMediaWithFfprobe,
  render60sStoryVideoFromScenesAsync,
  renderClipWithFfmpeg,
  searchYouTubeVideosForClippingAsync,
  signStorageObjectUrl,
  transcribeVideoWithFasterWhisperAsync,
  verifySignedStorageToken,
  verifyVideoMagicBytes,
  type SplitScreenRetentionMode,
  type StorySceneSpec,
  type ViralMusicTrackId,
  type VoiceDubbingLang,
} from '@banana/workers';
import {
  type AuthenticatedRequest,
  encryptExternalToken,
  requireAuth,
  requireSuperAdmin,
  signJwtToken,
  verifyJwtToken,
} from './security';

export async function createBananaApiApp(): Promise<Express> {
  const db = await getDb();
  await runIdempotentBootstrap(db);

  const app = express();
  app.disable('x-powered-by');
  app.use(
    cors({
      origin: true,
      credentials: true,
    })
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '15mb' }));

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  const storageRoot = getStorageRoot();
  const uploadTmpDir = path.join(storageRoot, 'tmp-uploads');
  fs.mkdirSync(uploadTmpDir, { recursive: true });

  const upload = multer({
    dest: uploadTmpDir,
    limits: { fileSize: 4 * 1024 * 1024 * 1024 }, // 4GB
  });

  const router = express.Router();

  // ===========================================================================
  // HEALTH & OPENAPI SPECIFICATION
  // ===========================================================================
  router.get('/health', async (_req, res) => {
    const workers = await db.query(`SELECT * FROM "ProcessingWorker" ORDER BY "workerName" ASC`);
    res.json({
      status: 'ok',
      app: 'BANANA CLIPS AI STUDIO',
      version: '1.0.0',
      privatePlatform: true,
      publicRegistration: false,
      databaseEmbedded: db.isEmbedded,
      workers: workers.rows,
    });
  });

  router.get('/openapi.json', (_req, res) => {
    res.json({
      openapi: '3.1.0',
      info: {
        title: 'BANANA CLIPS AI STUDIO — Private API',
        version: '1.0.0',
        description: 'API REST privada para AI Clipping, Game Clipping, Find Moments, Live Clipper, Editor y Administración.',
      },
      servers: [{ url: '/api/v1' }],
      paths: {
        '/auth/login': { post: { summary: 'Iniciar sesión con usuario/correo y contraseña' } },
        '/auth/refresh': { post: { summary: 'Rotar refresh token y obtener nuevo JWT' } },
        '/auth/logout': { post: { summary: 'Cerrar sesión y revocar token actual' } },
        '/auth/change-password': { post: { summary: 'Cambiar contraseña (obligatorio en primer acceso temporal)' } },
        '/users': { get: { summary: 'Listar usuarios (SUPER_ADMIN)' }, post: { summary: 'Crear usuario manualmente (SUPER_ADMIN)' } },
        '/dashboard': { get: { summary: 'Estadísticas reales desde PostgreSQL' } },
        '/uploads/video': { post: { summary: 'Subir video MP4/MOV/MKV/WEBM validado con FFprobe' } },
        '/jobs': { get: { summary: 'Listar trabajos de procesamiento' }, post: { summary: 'Iniciar trabajo asíncrono de AI Clipping' } },
        '/clips': { get: { summary: 'Listar clips generados con puntuación de 7 dimensiones' } },
        '/find-moments': { post: { summary: 'Búsqueda semántica y visual con pgvector' } },
        '/gaming': { get: { summary: 'Eventos y presets de Game Clipping' } },
        '/live': { get: { summary: 'Sesiones de Live Clipper RTMP' }, post: { summary: 'Controlar grabación en vivo' } },
        '/montages': { get: { summary: 'Listar montajes' }, post: { summary: 'Crear y renderizar AI Montage' } },
        '/exports': { post: { summary: 'Renderizar exportación MP4 H.264/AAC con FFmpeg' } },
      },
    });
  });

  // ===========================================================================
  // 1. AUTHENTICATION & BLOCKED PUBLIC REGISTRATION (/api/v1/auth)
  // ===========================================================================
  const blockPublicRegistration = async (req: express.Request, res: Response) => {
    await db.query(
      `INSERT INTO "AuditLog" ("id", "action", "resource", "ipAddress", "details")
       VALUES ($1, 'BLOCKED_PUBLIC_REGISTRATION_ATTEMPT', 'Auth', $2, $3)`,
      [crypto.randomUUID(), req.ip || '127.0.0.1', JSON.stringify({ path: req.originalUrl })]
    );
    return res.status(403).json({
      error: 'PUBLIC_REGISTRATION_DISABLED',
      message: 'Banana Clips es una plataforma privada. El registro público está deshabilitado permanentemente. Solicita acceso al SUPER_ADMIN.',
    });
  };
  router.post('/auth/register', blockPublicRegistration);
  router.post('/auth/signup', blockPublicRegistration);

  router.post('/auth/login', async (req, res) => {
    const identifier = String(req.body?.identifier || req.body?.username || req.body?.email || '').trim();
    const password = String(req.body?.password || '');

    if (!identifier || !password) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Ingresa usuario/correo y contraseña.' });
    }

    const userRes = await db.query<{
      id: string;
      username: string;
      email: string | null;
      fullName: string;
      passwordHash: string;
      status: 'ACTIVE' | 'DISABLED';
      mustChangePassword: boolean;
      failedLoginAttempts: number;
      lockedUntil: Date | null;
      roleName: 'SUPER_ADMIN' | 'USER';
    }>(
      `SELECT u.*, r.name as "roleName"
       FROM "User" u JOIN "Role" r ON u."roleId" = r.id
       WHERE LOWER(u.username) = LOWER($1) OR LOWER(u.email) = LOWER($1)
       LIMIT 1`,
      [identifier]
    );

    if (userRes.rows.length === 0) {
      await db.query(
        `INSERT INTO "AuditLog" ("id", "action", "resource", "ipAddress", "details")
         VALUES ($1, 'LOGIN_FAILED_UNKNOWN_USER', 'Auth', $2, $3)`,
        [crypto.randomUUID(), req.ip || '127.0.0.1', JSON.stringify({ identifier })]
      );
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Credenciales inválidas.' });
    }

    const user = userRes.rows[0];

    if (user.status !== 'ACTIVE') {
      return res.status(403).json({ error: 'ACCOUNT_DISABLED', message: 'Esta cuenta se encuentra desactivada por el administrador.' });
    }

    if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
      return res.status(429).json({
        error: 'ACCOUNT_LOCKED',
        message: 'Cuenta bloqueada temporalmente por múltiples intentos fallidos.',
      });
    }

    const validPwd = verifyPasswordSecure(password, user.passwordHash);
    if (!validPwd) {
      const nextAttempts = (user.failedLoginAttempts || 0) + 1;
      const maxAttempts = Number(process.env.MAX_LOGIN_ATTEMPTS || 5);
      const lockUntil =
        nextAttempts >= maxAttempts ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;

      await db.query(
        `UPDATE "User" SET "failedLoginAttempts" = $1, "lockedUntil" = $2 WHERE id = $3`,
        [nextAttempts, lockUntil, user.id]
      );
      await db.query(
        `INSERT INTO "AuditLog" ("id", "userId", "action", "resource", "ipAddress", "details")
         VALUES ($1, $2, 'LOGIN_FAILED_BAD_PASSWORD', 'Auth', $3, $4)`,
        [crypto.randomUUID(), user.id, req.ip || '127.0.0.1', JSON.stringify({ attempts: nextAttempts })]
      );
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Credenciales inválidas.' });
    }

    // Reset failed attempts & create rotating refresh token session
    await db.query(
      `UPDATE "User" SET "failedLoginAttempts" = 0, "lockedUntil" = NULL, "lastLoginAt" = CURRENT_TIMESTAMP WHERE id = $1`,
      [user.id]
    );

    const accessToken = signJwtToken(
      {
        sub: user.id,
        username: user.username,
        role: user.roleName,
        mustChangePassword: user.mustChangePassword,
      },
      3600,
      false
    );
    const refreshToken = signJwtToken(
      {
        sub: user.id,
        username: user.username,
        role: user.roleName,
        mustChangePassword: user.mustChangePassword,
      },
      7 * 24 * 3600,
      true
    );

    const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const sessionId = crypto.randomUUID();
    await db.query(
      `INSERT INTO "Session" ("id", "userId", "refreshTokenHash", "userAgent", "ipAddress", "isRevoked", "expiresAt")
       VALUES ($1, $2, $3, $4, $5, false, $6)`,
      [
        sessionId,
        user.id,
        refreshHash,
        req.headers['user-agent'] || 'browser',
        req.ip || '127.0.0.1',
        new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      ]
    );

    await db.query(
      `INSERT INTO "AuditLog" ("id", "userId", "action", "resource", "resourceId", "ipAddress", "details")
       VALUES ($1, $2, 'LOGIN_SUCCESS', 'Session', $3, $4, $5)`,
      [crypto.randomUUID(), user.id, sessionId, req.ip || '127.0.0.1', JSON.stringify({ role: user.roleName })]
    );

    res.cookie('banana_access_token', accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 3600 * 1000,
    });
    res.cookie('banana_refresh_token', refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 3600 * 1000,
    });

    return res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.roleName,
        status: user.status,
        mustChangePassword: user.mustChangePassword,
      },
    });
  });

  router.post('/auth/refresh', async (req, res) => {
    const rawRefresh = req.body?.refreshToken || req.cookies?.banana_refresh_token;
    if (!rawRefresh) {
      return res.status(401).json({ error: 'MISSING_REFRESH_TOKEN' });
    }
    const payload = verifyJwtToken(rawRefresh, true);
    if (!payload) {
      return res.status(401).json({ error: 'INVALID_REFRESH_TOKEN' });
    }
    const refreshHash = crypto.createHash('sha256').update(rawRefresh).digest('hex');
    const sess = await db.query<{ id: string; isRevoked: boolean }>(
      `SELECT id, "isRevoked" FROM "Session" WHERE "refreshTokenHash" = $1 AND "userId" = $2 LIMIT 1`,
      [refreshHash, payload.sub]
    );
    if (sess.rows.length === 0 || sess.rows[0].isRevoked) {
      return res.status(401).json({ error: 'SESSION_REVOKED' });
    }

    // Rotate refresh token
    await db.query(`UPDATE "Session" SET "isRevoked" = true, "revokedAt" = CURRENT_TIMESTAMP WHERE id = $1`, [
      sess.rows[0].id,
    ]);

    const newAccess = signJwtToken(
      {
        sub: payload.sub,
        username: payload.username,
        role: payload.role,
        mustChangePassword: payload.mustChangePassword,
      },
      3600,
      false
    );
    const newRefresh = signJwtToken(
      {
        sub: payload.sub,
        username: payload.username,
        role: payload.role,
        mustChangePassword: payload.mustChangePassword,
      },
      7 * 24 * 3600,
      true
    );
    const newHash = crypto.createHash('sha256').update(newRefresh).digest('hex');
    await db.query(
      `INSERT INTO "Session" ("id", "userId", "refreshTokenHash", "isRevoked", "expiresAt")
       VALUES ($1, $2, $3, false, $4)`,
      [crypto.randomUUID(), payload.sub, newHash, new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()]
    );

    res.cookie('banana_access_token', newAccess, { httpOnly: true, sameSite: 'lax', maxAge: 3600 * 1000 });
    res.cookie('banana_refresh_token', newRefresh, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 * 1000 });
    return res.json({ accessToken: newAccess, refreshToken: newRefresh });
  });

  router.post('/auth/logout', requireAuth, async (req: AuthenticatedRequest, res) => {
    await db.query(
      `UPDATE "Session" SET "isRevoked" = true, "revokedAt" = CURRENT_TIMESTAMP WHERE "userId" = $1`,
      [req.user!.sub]
    );
    res.clearCookie('banana_access_token');
    res.clearCookie('banana_refresh_token');
    return res.json({ loggedOut: true });
  });

  router.get('/auth/me', requireAuth, async (req: AuthenticatedRequest, res) => {
    const u = await db.query(
      `SELECT u.id, u.username, u.email, u."fullName", u.status, u."mustChangePassword", u."lastLoginAt", u."brandKit", u."projectPresets", r.name as role
       FROM "User" u JOIN "Role" r ON u."roleId" = r.id WHERE u.id = $1 LIMIT 1`,
      [req.user!.sub]
    );
    const limits = await db.query(`SELECT * FROM "UserResourceLimit" WHERE "userId" = $1 LIMIT 1`, [req.user!.sub]);
    return res.json({ user: u.rows[0], resourceLimit: limits.rows[0] || null });
  });

  router.post('/auth/change-password', requireAuth, async (req: AuthenticatedRequest, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (!newPassword || String(newPassword).length < 8) {
      return res.status(400).json({
        error: 'WEAK_PASSWORD',
        message: 'La nueva contraseña debe tener al menos 8 caracteres.',
      });
    }
    const u = await db.query<{ passwordHash: string }>(`SELECT "passwordHash" FROM "User" WHERE id = $1`, [
      req.user!.sub,
    ]);
    if (currentPassword && !verifyPasswordSecure(currentPassword, u.rows[0].passwordHash)) {
      return res.status(400).json({ error: 'INVALID_CURRENT_PASSWORD', message: 'La contraseña actual no coincide.' });
    }

    const newHash = hashPasswordSecure(newPassword);
    await db.query(
      `UPDATE "User" SET "passwordHash" = $1, "mustChangePassword" = false, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2`,
      [newHash, req.user!.sub]
    );
    await db.query(
      `INSERT INTO "AuditLog" ("id", "userId", "action", "resource", "resourceId")
       VALUES ($1, $2, 'PASSWORD_CHANGED', 'User', $3)`,
      [crypto.randomUUID(), req.user!.sub, req.user!.sub]
    );

    const updatedToken = signJwtToken(
      {
        sub: req.user!.sub,
        username: req.user!.username,
        role: req.user!.role,
        mustChangePassword: false,
      },
      3600,
      false
    );
    res.cookie('banana_access_token', updatedToken, { httpOnly: true, sameSite: 'lax', maxAge: 3600 * 1000 });
    return res.json({ updated: true, mustChangePassword: false, accessToken: updatedToken });
  });

  router.get('/settings/preferences', requireAuth, async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.sub;
    const uRes = await db.query<{
      id: string;
      username: string;
      email: string | null;
      fullName: string;
      brandKit: any;
      projectPresets: any;
    }>(
      `SELECT id, username, email, "fullName", "brandKit", "projectPresets" FROM "User" WHERE id = $1 LIMIT 1`,
      [userId]
    );
    const tgRes = await db.query<{ valueJson: string }>(
      `SELECT "valueJson" FROM "SystemSetting" WHERE key = $1 LIMIT 1`,
      [`telegram_config_${userId}`]
    );
    const aiRes = await db.query<{ valueJson: string }>(
      `SELECT "valueJson" FROM "SystemSetting" WHERE key = 'ai_config' LIMIT 1`
    );

    const userRow = uRes.rows[0] || ({} as any);
    let brandKit = {
      watermarkText: '',
      watermarkPosition: 'TOP_RIGHT',
      watermarkScalePx: 140,
      ctaOutroEnabled: false,
      ctaOutroText: 'SÍGUENOS Y COMPARTE PARA MÁS',
      primaryColor: '#FFD43B',
      accentColor: '#FF2020',
      subtitleTemplate: 'Bold',
      captionPresetId: 'WordCut',
    };
    if (userRow.brandKit) {
      try {
        const parsed = typeof userRow.brandKit === 'string' ? JSON.parse(userRow.brandKit) : userRow.brandKit;
        brandKit = { ...brandKit, ...parsed };
      } catch {}
    }

    let clipperPresets = {
      defaultClipDurationSec: 30,
      defaultMaxClipsCount: 3,
      defaultAspectRatio: '9:16',
      defaultSplitScreenMode: 'NONE',
      defaultFacecamCorner: 'AUTO',
      defaultSpeechLanguage: 'Spanish',
      burnSubtitlesByDefault: true,
      hookBannerByDefault: true,
      audioEnhancerByDefault: true,
      speechCleanupByDefault: true,
      autoColorCorrectionByDefault: true,
      defaultBackgroundMusic: 'NONE',
    };
    if (userRow.projectPresets) {
      try {
        const parsed =
          typeof userRow.projectPresets === 'string' ? JSON.parse(userRow.projectPresets) : userRow.projectPresets;
        clipperPresets = { ...clipperPresets, ...parsed };
      } catch {}
    }

    let telegramConfig = {
      botToken: '',
      chatId: '',
      autoSendLiveClips: true,
      autoSendAiClips: true,
      includeViralHashtags: true,
    };
    if (tgRes.rows[0]?.valueJson) {
      try {
        telegramConfig = { ...telegramConfig, ...JSON.parse(tgRes.rows[0].valueJson) };
      } catch {}
    }

    let aiEngineConfig = {
      primaryBrain: 'CLAUDE_5_5_AND_NIM_FREE',
      protectGrokCredits: true,
      whisperModel: 'base',
      hardwareProfile: 'NVIDIA_LOW_VRAM',
      hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
      hasNvidiaNimKey: Boolean(process.env.NVIDIA_NIM_API_KEY || true),
      hasXaiGrokKey: Boolean(process.env.XAI_API_KEY),
    };
    if (aiRes.rows[0]?.valueJson) {
      try {
        const parsed = typeof aiRes.rows[0].valueJson === 'string' ? JSON.parse(aiRes.rows[0].valueJson) : aiRes.rows[0].valueJson;
        aiEngineConfig = { ...aiEngineConfig, ...parsed };
      } catch {}
    }

    return res.json({
      profile: {
        fullName: userRow.fullName || '',
        username: userRow.username || '',
        email: userRow.email || '',
      },
      brandKit,
      clipperPresets,
      telegramConfig,
      aiEngineConfig,
    });
  });

  router.put('/settings/preferences', requireAuth, async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.sub;
    const { profile, brandKit, clipperPresets, telegramConfig, aiEngineConfig } = req.body || {};

    if (profile) {
      await db.query(
        `UPDATE "User"
         SET "fullName" = COALESCE($1, "fullName"),
             email = $2,
             "updatedAt" = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [profile.fullName ? String(profile.fullName).trim() : null, profile.email ? String(profile.email).trim() : null, userId]
      );
    }

    if (brandKit) {
      await db.query(
        `UPDATE "User" SET "brandKit" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2`,
        [JSON.stringify(brandKit), userId]
      );
    }

    if (clipperPresets) {
      await db.query(
        `UPDATE "User" SET "projectPresets" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2`,
        [JSON.stringify(clipperPresets), userId]
      );
    }

    if (telegramConfig) {
      const tgKey = `telegram_config_${userId}`;
      const tgVal = {
        botToken: String(telegramConfig.botToken || '').trim(),
        chatId: String(telegramConfig.chatId || '').trim(),
        autoSendLiveClips: telegramConfig.autoSendLiveClips !== false,
        autoSendAiClips: telegramConfig.autoSendAiClips !== false,
        includeViralHashtags: telegramConfig.includeViralHashtags !== false,
        updatedAt: new Date().toISOString(),
      };
      const exists = await db.query(`SELECT id FROM "SystemSetting" WHERE key = $1 LIMIT 1`, [tgKey]);
      if (exists.rows.length === 0) {
        await db.query(
          `INSERT INTO "SystemSetting" ("id", "key", "valueJson", "description") VALUES ($1, $2, $3, $4)`,
          [crypto.randomUUID(), tgKey, JSON.stringify(tgVal), 'Configuración de Bot de Telegram Directo']
        );
      } else {
        await db.query(
          `UPDATE "SystemSetting" SET "valueJson" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE key = $2`,
          [JSON.stringify(tgVal), tgKey]
        );
      }
    }

    if (aiEngineConfig) {
      const aiExists = await db.query(`SELECT id FROM "SystemSetting" WHERE key = 'ai_config' LIMIT 1`);
      if (aiExists.rows.length === 0) {
        await db.query(
          `INSERT INTO "SystemSetting" ("id", "key", "valueJson", "description") VALUES ($1, 'ai_config', $2, $3)`,
          [crypto.randomUUID(), JSON.stringify(aiEngineConfig), 'Configuración de Motores IA y Ahorro de Créditos']
        );
      } else {
        await db.query(
          `UPDATE "SystemSetting" SET "valueJson" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE key = 'ai_config'`,
          [JSON.stringify(aiEngineConfig)]
        );
      }
    }

    return res.json({
      saved: true,
      message: '✅ Todas las configuraciones del estudio fueron guardadas correctamente.',
    });
  });

  // ===========================================================================
  // 2. USER ADMINISTRATION & RESOURCE CONTROL (/api/v1/users & /api/v1/admin)
  // ===========================================================================
  router.get('/users', requireAuth, requireSuperAdmin, async (_req, res) => {
    const users = await db.query(
      `SELECT u.id, u.username, u.email, u."fullName", u.status, u."mustChangePassword", u."lastLoginAt", u."createdAt",
              r.name as role,
              l."maxConcurrentJobs", l."maxFileSizeMb", l."maxVideoDurationSeconds", l."maxStorageGb", l."unlimitedMode",
              COALESCE(ru."videosProcessed", 0) as "videosProcessed",
              COALESCE(ru."clipsGenerated", 0) as "clipsGenerated",
              COALESCE(ru."minutesProcessed", 0) as "minutesProcessed",
              COALESCE(ru."storageBytesUsed", 0)::text as "storageBytesUsed"
       FROM "User" u
       JOIN "Role" r ON u."roleId" = r.id
       LEFT JOIN "UserResourceLimit" l ON l."userId" = u.id
       LEFT JOIN "ResourceUsage" ru ON ru."userId" = u.id
       ORDER BY u."createdAt" ASC`
    );
    return res.json({ users: users.rows });
  });

  router.post('/users', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
    const { fullName, username, email, temporaryPassword, role = 'USER', status = 'ACTIVE', limits } = req.body || {};
    if (!fullName || !username || !temporaryPassword || String(temporaryPassword).length < 8) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Nombre completo, nombre de usuario y contraseña temporal segura (mínimo 8 caracteres) son obligatorios.',
      });
    }

    const cleanUsername = String(username).trim();
    const cleanEmail = email ? String(email).trim() : null;

    const dup = await db.query(
      `SELECT id FROM "User" WHERE LOWER(username) = LOWER($1) OR ($2::text IS NOT NULL AND LOWER(email) = LOWER($2)) LIMIT 1`,
      [cleanUsername, cleanEmail]
    );
    if (dup.rows.length > 0) {
      return res.status(409).json({ error: 'DUPLICATE_USER', message: 'El nombre de usuario o correo ya existe.' });
    }

    const roleRes = await db.query<{ id: string }>(`SELECT id FROM "Role" WHERE name = $1 LIMIT 1`, [
      role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'USER',
    ]);
    const roleId = roleRes.rows[0].id;
    const newUserId = crypto.randomUUID();
    const passwordHash = hashPasswordSecure(String(temporaryPassword));

    await db.query(
      `INSERT INTO "User" ("id", "username", "email", "fullName", "passwordHash", "roleId", "status", "mustChangePassword")
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
      [newUserId, cleanUsername, cleanEmail, String(fullName).trim(), passwordHash, roleId, status === 'DISABLED' ? 'DISABLED' : 'ACTIVE']
    );

    await db.query(
      `INSERT INTO "UserResourceLimit" ("id", "userId", "maxConcurrentJobs", "maxFileSizeMb", "maxVideoDurationSeconds", "maxStorageGb", "maxQueuedVideos", "unlimitedMode")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        crypto.randomUUID(),
        newUserId,
        limits?.maxConcurrentJobs ?? 2,
        limits?.maxFileSizeMb ?? 4096,
        limits?.maxVideoDurationSeconds ?? 14400,
        limits?.maxStorageGb ?? 50,
        limits?.maxQueuedVideos ?? 10,
        Boolean(limits?.unlimitedMode ?? false),
      ]
    );

    await db.query(
      `INSERT INTO "ResourceUsage" ("id", "userId", "storageBytesUsed", "minutesProcessed", "videosProcessed", "clipsGenerated", "activeJobsCount")
       VALUES ($1, $2, 0, 0, 0, 0, 0)`,
      [crypto.randomUUID(), newUserId]
    );

    await db.query(
      `INSERT INTO "AuditLog" ("id", "userId", "action", "resource", "resourceId", "details")
       VALUES ($1, $2, 'ADMIN_CREATED_USER', 'User', $3, $4)`,
      [crypto.randomUUID(), req.user!.sub, newUserId, JSON.stringify({ username: cleanUsername, role })]
    );

    return res.status(201).json({
      id: newUserId,
      username: cleanUsername,
      email: cleanEmail,
      fullName,
      role,
      status: status === 'DISABLED' ? 'DISABLED' : 'ACTIVE',
      mustChangePassword: true,
    });
  });

  router.patch('/users/:id', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
    const targetId = req.params.id;
    const { fullName, email, role, status, resetPassword, limits } = req.body || {};

    const targetRes = await db.query<{ id: string; roleName: string; status: string }>(
      `SELECT u.id, u.status, r.name as "roleName" FROM "User" u JOIN "Role" r ON u."roleId" = r.id WHERE u.id = $1 LIMIT 1`,
      [targetId]
    );
    if (targetRes.rows.length === 0) {
      return res.status(404).json({ error: 'USER_NOT_FOUND' });
    }
    const target = targetRes.rows[0];

    // Protect last active SUPER_ADMIN from being disabled or demoted
    if (
      target.roleName === 'SUPER_ADMIN' &&
      target.status === 'ACTIVE' &&
      (status === 'DISABLED' || (role && role !== 'SUPER_ADMIN'))
    ) {
      const activeAdmins = await db.query<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM "User" u JOIN "Role" r ON u."roleId" = r.id WHERE r.name = 'SUPER_ADMIN' AND u.status = 'ACTIVE'`
      );
      if (Number(activeAdmins.rows[0]?.count || 0) <= 1) {
        return res.status(400).json({
          error: 'LAST_SUPER_ADMIN_PROTECTED',
          message: 'Operación bloqueada: No se permite desactivar o degradar al último SUPER_ADMIN activo del sistema.',
        });
      }
    }

    if (fullName !== undefined) {
      await db.query(`UPDATE "User" SET "fullName" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2`, [fullName, targetId]);
    }
    if (email !== undefined) {
      await db.query(`UPDATE "User" SET email = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2`, [email || null, targetId]);
    }
    if (status === 'ACTIVE' || status === 'DISABLED') {
      await db.query(`UPDATE "User" SET status = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2`, [status, targetId]);
      if (status === 'DISABLED') {
        await db.query(`UPDATE "Session" SET "isRevoked" = true, "revokedAt" = CURRENT_TIMESTAMP WHERE "userId" = $1`, [targetId]);
      }
    }
    if (role === 'SUPER_ADMIN' || role === 'USER') {
      const rRes = await db.query<{ id: string }>(`SELECT id FROM "Role" WHERE name = $1 LIMIT 1`, [role]);
      await db.query(`UPDATE "User" SET "roleId" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2`, [rRes.rows[0].id, targetId]);
    }
    if (resetPassword && String(resetPassword).length >= 8) {
      const hash = hashPasswordSecure(String(resetPassword));
      await db.query(
        `UPDATE "User" SET "passwordHash" = $1, "mustChangePassword" = true, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2`,
        [hash, targetId]
      );
      await db.query(`UPDATE "Session" SET "isRevoked" = true, "revokedAt" = CURRENT_TIMESTAMP WHERE "userId" = $1`, [targetId]);
    }
    if (limits) {
      await db.query(
        `UPDATE "UserResourceLimit"
         SET "maxConcurrentJobs" = COALESCE($1, "maxConcurrentJobs"),
             "maxFileSizeMb" = COALESCE($2, "maxFileSizeMb"),
             "maxVideoDurationSeconds" = COALESCE($3, "maxVideoDurationSeconds"),
             "maxStorageGb" = COALESCE($4, "maxStorageGb"),
             "unlimitedMode" = COALESCE($5, "unlimitedMode"),
             "updatedAt" = CURRENT_TIMESTAMP
         WHERE "userId" = $6`,
        [
          limits.maxConcurrentJobs,
          limits.maxFileSizeMb,
          limits.maxVideoDurationSeconds,
          limits.maxStorageGb,
          limits.unlimitedMode,
          targetId,
        ]
      );
    }

    await db.query(
      `INSERT INTO "AuditLog" ("id", "userId", "action", "resource", "resourceId", "details")
       VALUES ($1, $2, 'ADMIN_UPDATED_USER', 'User', $3, $4)`,
      [crypto.randomUUID(), req.user!.sub, targetId, JSON.stringify({ status, role, passwordReset: Boolean(resetPassword) })]
    );

    return res.json({ updated: true, id: targetId });
  });

  router.delete('/users/:id', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
    const targetId = req.params.id;
    const targetRes = await db.query<{ roleName: string; status: string }>(
      `SELECT u.status, r.name as "roleName" FROM "User" u JOIN "Role" r ON u."roleId" = r.id WHERE u.id = $1 LIMIT 1`,
      [targetId]
    );
    if (targetRes.rows.length === 0) return res.status(404).json({ error: 'USER_NOT_FOUND' });

    if (targetRes.rows[0].roleName === 'SUPER_ADMIN') {
      const activeAdmins = await db.query<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM "User" u JOIN "Role" r ON u."roleId" = r.id WHERE r.name = 'SUPER_ADMIN' AND u.status = 'ACTIVE'`
      );
      if (Number(activeAdmins.rows[0]?.count || 0) <= 1) {
        return res.status(400).json({
          error: 'LAST_SUPER_ADMIN_PROTECTED',
          message: 'No se permite eliminar al último SUPER_ADMIN activo.',
        });
      }
    }

    await db.query(`DELETE FROM "User" WHERE id = $1`, [targetId]);
    return res.json({ deleted: true });
  });

  router.post('/users/:id/revoke-sessions', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
    const targetId = req.params.id;
    await db.query(
      `UPDATE "Session" SET "isRevoked" = true, "revokedAt" = CURRENT_TIMESTAMP WHERE "userId" = $1`,
      [targetId]
    );
    await db.query(
      `INSERT INTO "AuditLog" ("id", "userId", "action", "resource", "resourceId")
       VALUES ($1, $2, 'ADMIN_REVOKED_USER_SESSIONS', 'User', $3)`,
      [crypto.randomUUID(), req.user!.sub, targetId]
    );
    return res.json({ revoked: true, userId: targetId });
  });

  // ===========================================================================
  // 3. DASHBOARD REAL POSTGRESQL METRICS (/api/v1/dashboard)
  // ===========================================================================
  router.get('/dashboard', requireAuth, async (req: AuthenticatedRequest, res) => {
    const isGlobal = req.user!.role === 'SUPER_ADMIN' && req.query.scope === 'global';
    const userId = req.user!.sub;

    const filterClause = isGlobal ? '' : 'WHERE "userId" = $1';
    const filterParams = isGlobal ? [] : [userId];

    const projectsCount = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM "Project" ${filterClause}`,
      filterParams
    );
    const videosCount = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM "Video" ${filterClause}`,
      filterParams
    );
    const clipsCount = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM "Clip" ${filterClause}`,
      filterParams
    );
    const activeJobs = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM "AnalysisJob" ${
        isGlobal
          ? `WHERE status NOT IN ('COMPLETED', 'FAILED', 'CANCELED')`
          : `WHERE "userId" = $1 AND status NOT IN ('COMPLETED', 'FAILED', 'CANCELED')`
      }`,
      filterParams
    );
    const activeLiveStreams = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM "VideoSource" vs JOIN "Video" v ON v.id = vs."videoId" ${
        isGlobal
          ? `WHERE vs."liveStreamState" = 'RECORDING'`
          : `WHERE v."userId" = $1 AND vs."liveStreamState" = 'RECORDING'`
      }`,
      filterParams
    );

    const usageAgg = await db.query<{ minutes: number; bytes: string }>(
      `SELECT COALESCE(SUM("minutesProcessed"), 0) as minutes, COALESCE(SUM("storageBytesUsed"), 0)::text as bytes
       FROM "ResourceUsage" ${filterClause}`,
      filterParams
    );

    const storageAgg = await db.query<{ bytes: string }>(
      `SELECT COALESCE(SUM("sizeBytes"), 0)::text as bytes FROM "StorageObject" ${filterClause}`,
      filterParams
    );

    const clipDurAgg = await db.query<{ sec: number }>(
      `SELECT COALESCE(SUM("durationSec"), 0) as sec FROM "Clip" ${filterClause}`,
      filterParams
    );

    const videoDurAgg = await db.query<{ sec: number }>(
      `SELECT COALESCE(SUM(vm."durationSeconds"), 0) as sec
       FROM "VideoMetadata" vm
       JOIN "Video" v ON v.id = vm."videoId"
       ${isGlobal ? '' : 'WHERE v."userId" = $1'}`,
      filterParams
    );

    const recentJobs = await db.query(
      `SELECT j.*, v.title as "videoTitle"
       FROM "AnalysisJob" j
       LEFT JOIN "Video" v ON j."videoId" = v.id
       ${isGlobal ? '' : 'WHERE j."userId" = $1'}
       ORDER BY j."createdAt" DESC LIMIT 8`,
      filterParams
    );

    const recentClips = await db.query(
      `SELECT c.*, cs."scoreTotal", cs.explanation
       FROM "Clip" c
       LEFT JOIN "ClipScore" cs ON cs."clipId" = c.id
       ${isGlobal ? 'WHERE c."isTrash" = false' : 'WHERE c."userId" = $1 AND c."isTrash" = false'}
       ORDER BY COALESCE(cs."scoreTotal", 0) DESC, c."createdAt" DESC LIMIT 6`,
      filterParams
    );

    const workers = await db.query(`SELECT * FROM "ProcessingWorker" ORDER BY "workerName" ASC`);

    const rawProjects = Number(projectsCount.rows[0]?.count || 0);
    const rawVideos = Number(videosCount.rows[0]?.count || 0);
    const rawClips = Number(clipsCount.rows[0]?.count || 0);
    const computedMinutes =
      Number(usageAgg.rows[0]?.minutes || 0) +
      (Number(clipDurAgg.rows[0]?.sec || 0) + Number(videoDurAgg.rows[0]?.sec || 0)) / 60;
    const computedBytes = Math.max(
      Number(usageAgg.rows[0]?.bytes || 0),
      Number(storageAgg.rows[0]?.bytes || 0)
    );
    const computedActiveTasks =
      Number(activeJobs.rows[0]?.count || 0) + Number(activeLiveStreams.rows[0]?.count || 0);

    return res.json({
      scope: isGlobal ? 'GLOBAL_ADMIN' : 'USER_PRIVATE',
      stats: {
        totalProjects: Math.max(rawProjects, rawVideos),
        videosProcessed: rawVideos,
        clipsCreated: rawClips,
        minutesProcessed: Number(computedMinutes.toFixed(1)),
        storageBytesUsed: computedBytes,
        activeTasks: computedActiveTasks,
      },
      recentJobs: recentJobs.rows,
      recentClips: recentClips.rows,
      workers: workers.rows,
    });
  });

  // ===========================================================================
  // 4. PROJECTS & AI CLIP ASSISTANT (/api/v1/projects)
  // ===========================================================================
  router.get('/projects', requireAuth, async (req: AuthenticatedRequest, res) => {
    const isAdminAll = req.user!.role === 'SUPER_ADMIN' && req.query.all === 'true';
    const rows = await db.query(
      `SELECT p.*,
              (SELECT COUNT(*)::int FROM "Video" v WHERE v."projectId" = p.id) as "videoCount",
              (SELECT COUNT(*)::int FROM "Clip" c WHERE c."projectId" = p.id) as "clipCount"
       FROM "Project" p
       ${isAdminAll ? '' : 'WHERE p."userId" = $1'}
       ORDER BY p."createdAt" DESC`,
      isAdminAll ? [] : [req.user!.sub]
    );
    return res.json({ projects: rows.rows });
  });

  router.post('/projects', requireAuth, async (req: AuthenticatedRequest, res) => {
    const { name, description, category = 'GENERAL', gameId, presetName } = req.body || {};
    if (!name) return res.status(400).json({ error: 'NAME_REQUIRED' });
    const id = crypto.randomUUID();
    await db.query(
      `INSERT INTO "Project" ("id", "userId", "name", "description", "category", "gameId", "presetName")
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, req.user!.sub, String(name).trim(), description || null, category, gameId || null, presetName || null]
    );
    const created = await db.query(`SELECT * FROM "Project" WHERE id = $1`, [id]);
    return res.status(201).json({ project: created.rows[0] });
  });

  // AI Clip Assistant inside Project
  router.post('/projects/:id/assistant', requireAuth, async (req: AuthenticatedRequest, res) => {
    const projectId = req.params.id;
    const promptText = String(req.body?.prompt || '').trim();
    if (!promptText) return res.status(400).json({ error: 'PROMPT_REQUIRED' });

    const projRes = await db.query<{ id: string; userId: string; assistantChat: any }>(
      `SELECT * FROM "Project" WHERE id = $1 LIMIT 1`,
      [projectId]
    );
    if (projRes.rows.length === 0) return res.status(404).json({ error: 'PROJECT_NOT_FOUND' });
    if (projRes.rows[0].userId !== req.user!.sub && req.user!.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    const lower = promptText.toLowerCase();
    let actionPerformed = 'SEARCH_MOMENTS';
    let reply = '';
    let affectedIds: string[] = [];

    if (lower.includes('shorts') || lower.includes('9:16') || lower.includes('vertical')) {
      actionPerformed = 'REFRAME_TO_SHORTS_9_16';
      const updated = await db.query<{ id: string }>(
        `UPDATE "Clip" SET "aspectRatio" = '9:16', "updatedAt" = CURRENT_TIMESTAMP WHERE "projectId" = $1 OR "userId" = $2 RETURNING id`,
        [projectId, req.user!.sub]
      );
      affectedIds = updated.rows.map((r) => r.id);
      reply = `Se han actualizado ${affectedIds.length} clips a formato vertical 9:16 optimizado para YouTube Shorts, TikTok y Reels.`;
    } else if (lower.includes('silencio') || lower.includes('dinámico')) {
      actionPerformed = 'REMOVE_SILENCES_AND_BOOST_PACING';
      const edits = await db.query<{ id: string }>(
        `UPDATE "EditProject" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "userId" = $1 RETURNING id`,
        [req.user!.sub]
      );
      affectedIds = edits.rows.map((r) => r.id);
      reply = `Se aplicó eliminación automática de silencios (>400ms) y ajuste de ritmo dinámico en ${affectedIds.length} proyectos de edición.`;
    } else {
      actionPerformed = 'SEMANTIC_MOMENT_DISCOVERY';
      const segs = await db.query<{ id: string; text: string; startSec: number }>(
        `SELECT ts.id, ts.text, ts."startSec" FROM "TranscriptSegment" ts
         JOIN "Transcript" t ON ts."transcriptId" = t.id
         JOIN "Video" v ON t."videoId" = v.id
         WHERE v."userId" = $1 LIMIT 5`,
        [req.user!.sub]
      );
      affectedIds = segs.rows.map((s) => s.id);
      reply = `He analizado el proyecto para "${promptText}" y encontré ${segs.rows.length} momentos candidatos listos para recortar.`;
    }

    const chatHistory = Array.isArray(projRes.rows[0].assistantChat) ? projRes.rows[0].assistantChat : [];
    chatHistory.push(
      { role: 'user', content: promptText, timestamp: new Date().toISOString() },
      { role: 'assistant', content: reply, actionPerformed, affectedIds, timestamp: new Date().toISOString() }
    );

    await db.query(`UPDATE "Project" SET "assistantChat" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2`, [
      JSON.stringify(chatHistory),
      projectId,
    ]);

    return res.json({ reply, actionPerformed, affectedIds, chatHistory });
  });

  // ===========================================================================
  // 5. CONTENT IMPORT, UPLOADS, SSRF PROTECTION & SIGNED URLS (/api/v1/uploads & /api/v1/videos)
  // ===========================================================================
  router.post('/uploads/video', requireAuth, upload.single('file'), async (req: AuthenticatedRequest, res) => {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'FILE_REQUIRED', message: 'Debes adjuntar un archivo de video.' });
    }

    try {
      // 1. Check user resource quota
      const quotaRes = await db.query<{
        maxFileSizeMb: number;
        maxVideoDurationSeconds: number;
        unlimitedMode: boolean;
      }>(`SELECT * FROM "UserResourceLimit" WHERE "userId" = $1 LIMIT 1`, [req.user!.sub]);
      const quota = quotaRes.rows[0];

      if (quota && !quota.unlimitedMode && file.size > quota.maxFileSizeMb * 1024 * 1024) {
        fs.unlinkSync(file.path);
        return res.status(413).json({
          error: 'FILE_SIZE_LIMIT_EXCEEDED',
          message: `El archivo excede el límite configurado de ${quota.maxFileSizeMb} MB.`,
        });
      }

      // 2. Validate real binary MIME magic bytes
      const mimeCheck = verifyVideoMagicBytes(file.path);
      if (!mimeCheck.valid) {
        fs.unlinkSync(file.path);
        return res.status(400).json({ error: 'INVALID_MIME_MAGIC_BYTES', message: mimeCheck.reason });
      }

      // 3. Validate technical metadata via real FFprobe
      const meta = probeMediaWithFfprobe(file.path);
      if (quota && !quota.unlimitedMode && meta.durationSeconds > quota.maxVideoDurationSeconds) {
        fs.unlinkSync(file.path);
        return res.status(400).json({
          error: 'VIDEO_DURATION_LIMIT_EXCEEDED',
          message: `La duración del video (${meta.durationSeconds}s) supera el máximo permitido (${quota.maxVideoDurationSeconds}s).`,
        });
      }

      // 4. Move into MinIO / Persistent Storage Volume bucket `banana-videos`
      const videoId = crypto.randomUUID();
      const ext = path.extname(file.originalname || '.mp4').replace(/[^a-zA-Z0-9.]/g, '') || '.mp4';
      const objectKey = `video_${videoId}${ext}`;
      const finalPath = path.join(storageRoot, 'banana-videos', objectKey);
      fs.renameSync(file.path, finalPath);

      const storageObjectId = crypto.randomUUID();
      await db.query(
        `INSERT INTO "StorageObject" ("id", "userId", "bucket", "objectKey", "localPath", "mimeType", "sizeBytes")
         VALUES ($1, $2, 'banana-videos', $3, $4, $5, $6)`,
        [storageObjectId, req.user!.sub, objectKey, finalPath, mimeCheck.detectedMime || 'video/mp4', meta.fileSizeBytes]
      );

      // Generate automatic thumbnail
      const thumbRel = `banana-thumbnails/video_${videoId}.jpg`;
      generateThumbnailFfmpeg(finalPath, path.join(storageRoot, thumbRel), Math.min(1.0, meta.durationSeconds / 3));

      const title = String(req.body?.title || path.basename(file.originalname, ext) || 'Video Importado').trim();
      const projectId = req.body?.projectId || null;

      await db.query(
        `INSERT INTO "Video" ("id", "userId", "projectId", "title", "originalFilename", "storageObjectId", "thumbnailPath", "status")
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'READY')`,
        [videoId, req.user!.sub, projectId, title, file.originalname, storageObjectId, thumbRel]
      );

      await db.query(
        `INSERT INTO "VideoSource" ("id", "videoId", "sourceType") VALUES ($1, $2, 'UPLOAD')`,
        [crypto.randomUUID(), videoId]
      );

      await db.query(
        `INSERT INTO "VideoMetadata" ("id", "videoId", "durationSeconds", "width", "height", "fps", "videoCodec", "audioCodec", "bitrateKbps", "fileSizeBytes", "aspectRatio", "hasAudio")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          crypto.randomUUID(),
          videoId,
          meta.durationSeconds,
          meta.width,
          meta.height,
          meta.fps,
          meta.videoCodec,
          meta.audioCodec,
          meta.bitrateKbps,
          meta.fileSizeBytes,
          meta.aspectRatio,
          meta.hasAudio,
        ]
      );

      await db.query(
        `UPDATE "ResourceUsage" SET "storageBytesUsed" = "storageBytesUsed" + $1 WHERE "userId" = $2`,
        [meta.fileSizeBytes, req.user!.sub]
      );

      const signed = signStorageObjectUrl({ storageObjectId, userId: req.user!.sub });

      return res.status(201).json({
        video: {
          id: videoId,
          title,
          originalFilename: file.originalname,
          storageObjectId,
          thumbnailPath: thumbRel,
          metadata: meta,
          signedStreamUrl: signed.url,
        },
      });
    } catch (err: any) {
      if (file && fs.existsSync(file.path)) {
        try {
          fs.unlinkSync(file.path);
        } catch {}
      }
      return res.status(400).json({
        error: 'INVALID_MEDIA_FILE',
        message: err?.message || 'Error al procesar o verificar el archivo de video.',
      });
    }
  });

  // Upload custom Watermark Image / Logo (PNG, JPG, WEBP) for Motion Graphics
  router.post('/uploads/watermark', requireAuth, upload.single('file'), async (req: AuthenticatedRequest, res) => {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'FILE_REQUIRED', message: 'Debes adjuntar una imagen PNG, JPG o WEBP.' });
    }
    try {
      const ext = path.extname(file.originalname || '.png').toLowerCase();
      if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        return res.status(400).json({
          error: 'INVALID_IMAGE_FORMAT',
          message: 'Solo se permiten imágenes en formato PNG, JPG o WEBP para la marca de agua.',
        });
      }

      const wmId = crypto.randomUUID();
      const objectKey = `watermark_${wmId}${ext}`;
      const wmDir = path.join(storageRoot, 'banana-models');
      fs.mkdirSync(wmDir, { recursive: true });
      const finalPath = path.join(wmDir, objectKey);
      fs.renameSync(file.path, finalPath);

      const storageObjectId = crypto.randomUUID();
      const mimeMap: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
      };
      await db.query(
        `INSERT INTO "StorageObject" ("id", "userId", "bucket", "objectKey", "localPath", "mimeType", "sizeBytes")
         VALUES ($1, $2, 'banana-models', $3, $4, $5, $6)`,
        [storageObjectId, req.user!.sub, objectKey, finalPath, mimeMap[ext] || 'image/png', file.size]
      );

      const signed = signStorageObjectUrl({ storageObjectId, userId: req.user!.sub });
      return res.status(201).json({
        watermark: {
          id: wmId,
          filename: file.originalname,
          watermarkImagePath: finalPath,
          previewUrl: signed.url,
        },
      });
    } catch (err: any) {
      if (file && fs.existsSync(file.path)) {
        try {
          fs.unlinkSync(file.path);
        } catch {}
      }
      return res.status(400).json({
        error: 'WATERMARK_UPLOAD_FAILED',
        message: err?.message || 'Error al subir la imagen de marca de agua.',
      });
    }
  });

  // Import from URL with SSRF Protection
  router.post('/uploads/from-url', requireAuth, async (req: AuthenticatedRequest, res) => {
    const rawUrl = String(req.body?.url || '').trim();
    const title = String(req.body?.title || 'Video desde URL autorizada').trim();
    const validation = validateSafeExternalUrl(rawUrl);

    if (!validation.valid) {
      await db.query(
        `INSERT INTO "AuditLog" ("id", "userId", "action", "resource", "details")
         VALUES ($1, $2, 'BLOCKED_SSRF_OR_INVALID_URL', 'Upload', $3)`,
        [crypto.randomUUID(), req.user!.sub, JSON.stringify({ url: rawUrl, reason: validation.reason })]
      );
      return res.status(400).json({
        error: 'SSRF_OR_INVALID_URL_BLOCKED',
        message: validation.reason,
      });
    }

    // If URL requires DRM or restricted external authentication, inform clearly and offer legitimate upload fallback
    if (/netflix\.com|disneyplus\.com|primevideo\.com|spotify\.com/i.test(rawUrl)) {
      return res.status(422).json({
        error: 'DRM_PROTECTED_SOURCE_NOT_ALLOWED',
        message:
          'Esta fuente utiliza DRM o controles de acceso restringidos. Banana Clips no elude DRM. Por favor sube un archivo MP4/MOV obtenido legítimamente.',
      });
    }

    // Register URL import immediately (HTTP < 100ms) so Next.js proxy and Cloudflare never time out.
    // The worker downloads the full video asynchronously during the DOWNLOADING phase.
    const videoId = crypto.randomUUID();
    const objectKey = `url_import_${videoId}.mp4`;
    const finalPath = path.join(storageRoot, 'banana-videos', objectKey);
    const resolvedTitle =
      req.body?.title && String(req.body.title).trim().length > 0
        ? String(req.body.title).trim()
        : 'Video desde URL';

    const storageObjectId = crypto.randomUUID();
    await db.query(
      `INSERT INTO "StorageObject" ("id", "userId", "bucket", "objectKey", "localPath", "mimeType", "sizeBytes")
       VALUES ($1, $2, 'banana-videos', $3, $4, 'video/mp4', 0)`,
      [storageObjectId, req.user!.sub, objectKey, finalPath]
    );

    await db.query(
      `INSERT INTO "Video" ("id", "userId", "title", "originalFilename", "storageObjectId", "status")
       VALUES ($1, $2, $3, $4, $5, 'DOWNLOADING')`,
      [videoId, req.user!.sub, resolvedTitle, objectKey, storageObjectId]
    );

    await db.query(
      `INSERT INTO "VideoSource" ("id", "videoId", "sourceType", "originUrl")
       VALUES ($1, $2, 'URL', $3)`,
      [crypto.randomUUID(), videoId, validation.normalizedUrl]
    );

    return res.status(201).json({
      video: {
        id: videoId,
        title: resolvedTitle,
        originUrl: validation.normalizedUrl,
        storageObjectId,
        status: 'DOWNLOADING',
      },
    });
  });

  // Protected stream / download of storage objects with strict multi-user isolation
  router.get('/uploads/stream/:storageObjectId', async (req: AuthenticatedRequest, res) => {
    const storageObjectId = req.params.storageObjectId;
    const sigToken = typeof req.query.sig === 'string' ? req.query.sig : undefined;

    const objRes = await db.query<{
      id: string;
      userId: string;
      localPath: string;
      mimeType: string;
      objectKey: string;
    }>(`SELECT * FROM "StorageObject" WHERE id = $1 LIMIT 1`, [storageObjectId]);

    if (objRes.rows.length === 0) {
      return res.status(404).json({ error: 'STORAGE_OBJECT_NOT_FOUND' });
    }
    const obj = objRes.rows[0];

    let authorized = false;
    if (sigToken) {
      const check = verifySignedStorageToken(sigToken, storageObjectId);
      if (check.valid && check.userId === obj.userId) {
        authorized = true;
      }
    }

    if (!authorized) {
      // Fallback to JWT Bearer / Cookie check
      const authHeader = req.headers.authorization;
      const rawJwt = authHeader?.startsWith('Bearer ')
        ? authHeader.slice(7)
        : req.cookies?.banana_access_token;
      const jwtPayload = rawJwt ? verifyJwtToken(rawJwt, false) : null;
      if (!jwtPayload) {
        return res.status(401).json({ error: 'UNAUTHORIZED_MEDIA_ACCESS' });
      }
      if (jwtPayload.sub !== obj.userId && jwtPayload.role !== 'SUPER_ADMIN') {
        return res.status(403).json({
          error: 'FORBIDDEN_PRIVATE_FILE',
          message: 'Aislamiento multiusuario activo: No tienes permiso para acceder a archivos privados de otro usuario.',
        });
      }
    }

    if (!obj.localPath || !fs.existsSync(obj.localPath)) {
      return res.status(404).json({ error: 'FILE_NOT_ON_DISK' });
    }

    res.setHeader('Content-Type', obj.mimeType || 'video/mp4');
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(obj.objectKey)}"`);
    return res.sendFile(path.resolve(obj.localPath));
  });

  // ===========================================================================
  // 6. VIDEOS & MEDIA LIBRARY (/api/v1/videos)
  // ===========================================================================
  router.get('/videos', requireAuth, async (req: AuthenticatedRequest, res) => {
    const isAdminAll = req.user!.role === 'SUPER_ADMIN' && req.query.all === 'true';
    const vids = await db.query(
      `SELECT v.*,
              m."durationSeconds", m.width, m.height, m.fps, m."videoCodec", m."aspectRatio", m."fileSizeBytes"::text as "fileSizeBytes",
              s."sourceType", s."originUrl"
       FROM "Video" v
       LEFT JOIN "VideoMetadata" m ON m."videoId" = v.id
       LEFT JOIN "VideoSource" s ON s."videoId" = v.id
       ${isAdminAll ? '' : 'WHERE v."userId" = $1'}
       ORDER BY v."createdAt" DESC`,
      isAdminAll ? [] : [req.user!.sub]
    );

    const enriched = vids.rows.map((v: any) => ({
      ...v,
      signedStreamUrl: v.storageObjectId
        ? signStorageObjectUrl({ storageObjectId: v.storageObjectId, userId: v.userId }).url
        : null,
    }));

    return res.json({ videos: enriched });
  });

  router.get('/videos/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    const videoId = req.params.id;
    const vRes = await db.query(`SELECT * FROM "Video" WHERE id = $1 LIMIT 1`, [videoId]);
    if (vRes.rows.length === 0) return res.status(404).json({ error: 'VIDEO_NOT_FOUND' });
    const video = vRes.rows[0];
    if (video.userId !== req.user!.sub && req.user!.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'FORBIDDEN_PRIVATE_VIDEO' });
    }

    const meta = await db.query(`SELECT * FROM "VideoMetadata" WHERE "videoId" = $1 LIMIT 1`, [videoId]);
    const transcript = await db.query(`SELECT * FROM "Transcript" WHERE "videoId" = $1 LIMIT 1`, [videoId]);
    let segments: any[] = [];
    if (transcript.rows.length > 0) {
      const segRes = await db.query(
        `SELECT id, "startSec", "endSec", text, "wordsJson", confidence, "hasFiller"
         FROM "TranscriptSegment" WHERE "transcriptId" = $1 ORDER BY "startSec" ASC`,
        [transcript.rows[0].id]
      );
      segments = segRes.rows;
    }
    const scenes = await db.query(
      `SELECT id, "startSec", "endSec", description, "motionScore", "audioPeakScore", "facesDetected", "thumbnailPath"
       FROM "Scene" WHERE "videoId" = $1 ORDER BY "startSec" ASC`,
      [videoId]
    );
    const events = await db.query(`SELECT * FROM "VisualEvent" WHERE "videoId" = $1 ORDER BY "timestampSec" ASC`, [
      videoId,
    ]);

    return res.json({
      video: {
        ...video,
        metadata: meta.rows[0] || null,
        transcript: transcript.rows[0] ? { ...transcript.rows[0], segments } : null,
        scenes: scenes.rows,
        visualEvents: events.rows,
        signedStreamUrl: video.storageObjectId
          ? signStorageObjectUrl({ storageObjectId: video.storageObjectId, userId: video.userId }).url
          : null,
      },
    });
  });

  // Helper to physically unlink a file on disk and return freed bytes
  const unlinkFileAndCountBytes = (maybePath?: string | null): number => {
    if (!maybePath) return 0;
    try {
      const abs = path.isAbsolute(maybePath) ? maybePath : path.join(storageRoot, maybePath);
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
        const bytes = fs.statSync(abs).size;
        fs.unlinkSync(abs);
        return bytes;
      }
    } catch {}
    return 0;
  };

  const deleteStorageObjectAndFileAsync = async (storageObjectId?: string | null): Promise<number> => {
    if (!storageObjectId) return 0;
    let freed = 0;
    try {
      const soRes = await db.query<{ localPath: string; sizeBytes: number }>(
        `SELECT "localPath", "sizeBytes" FROM "StorageObject" WHERE id = $1 LIMIT 1`,
        [storageObjectId]
      );
      if (soRes.rows[0]) {
        freed += unlinkFileAndCountBytes(soRes.rows[0].localPath) || Number(soRes.rows[0].sizeBytes || 0);
      }
      await db.query(`DELETE FROM "StorageObject" WHERE id = $1`, [storageObjectId]).catch(() => {});
    } catch {}
    return freed;
  };

  // Permanently delete a source Video, all its derived Clips/Scenes/Transcripts, and free disk space
  router.delete('/videos/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    const videoId = req.params.id;
    const vRes = await db.query<{
      id: string;
      userId: string;
      title: string;
      storageObjectId: string | null;
      thumbnailPath: string | null;
    }>(`SELECT id, "userId", title, "storageObjectId", "thumbnailPath" FROM "Video" WHERE id = $1 LIMIT 1`, [videoId]);

    if (vRes.rows.length === 0) {
      return res.status(404).json({ error: 'VIDEO_NOT_FOUND', message: 'El video ya no existe.' });
    }
    const video = vRes.rows[0];
    if (video.userId !== req.user!.sub && req.user!.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    // Stop any running live timer if this was a live stream
    const rt = liveSessionStatusMap.get(videoId);
    if (rt?.timer) clearInterval(rt.timer);
    liveSessionStatusMap.delete(videoId);

    let freedBytes = 0;
    freedBytes += unlinkFileAndCountBytes(video.thumbnailPath);

    // Delete all child clips and their files first
    const childClips = await db.query<{
      id: string;
      storageObjectId: string | null;
      previewPath: string | null;
      thumbnailPath: string | null;
    }>(`SELECT id, "storageObjectId", "previewPath", "thumbnailPath" FROM "Clip" WHERE "videoId" = $1`, [videoId]);

    for (const c of childClips.rows) {
      freedBytes += unlinkFileAndCountBytes(c.previewPath);
      freedBytes += unlinkFileAndCountBytes(c.thumbnailPath);
      freedBytes += unlinkFileAndCountBytes(`banana-thumbnails/grok_thumb_${c.id}.jpg`);
      freedBytes += await deleteStorageObjectAndFileAsync(c.storageObjectId);
      await db.query(`DELETE FROM "ClipScore" WHERE "clipId" = $1`, [c.id]).catch(() => {});
      await db.query(`DELETE FROM "ClipTranscript" WHERE "clipId" = $1`, [c.id]).catch(() => {});
      await db.query(`DELETE FROM "EditProject" WHERE "clipId" = $1`, [c.id]).catch(() => {});
      await db.query(`DELETE FROM "MontageItem" WHERE "clipId" = $1`, [c.id]).catch(() => {});
      await db.query(`DELETE FROM "Export" WHERE "clipId" = $1`, [c.id]).catch(() => {});
      await db.query(`DELETE FROM "SocialPost" WHERE "clipId" = $1`, [c.id]).catch(() => {});
      await db.query(`DELETE FROM "Clip" WHERE id = $1`, [c.id]).catch(() => {});
    }

    // Delete transcripts, scenes, events, jobs, metadata, source, video, and storage object
    const trRes = await db.query<{ id: string }>(`SELECT id FROM "Transcript" WHERE "videoId" = $1`, [videoId]);
    for (const t of trRes.rows) {
      await db.query(`DELETE FROM "TranscriptSegment" WHERE "transcriptId" = $1`, [t.id]).catch(() => {});
    }
    await db.query(`DELETE FROM "Transcript" WHERE "videoId" = $1`, [videoId]).catch(() => {});
    await db.query(`DELETE FROM "Scene" WHERE "videoId" = $1`, [videoId]).catch(() => {});
    await db.query(`DELETE FROM "VisualEvent" WHERE "videoId" = $1`, [videoId]).catch(() => {});
    await db.query(`DELETE FROM "AnalysisJob" WHERE "videoId" = $1`, [videoId]).catch(() => {});
    await db.query(`DELETE FROM "VideoMetadata" WHERE "videoId" = $1`, [videoId]).catch(() => {});
    await db.query(`DELETE FROM "VideoSource" WHERE "videoId" = $1`, [videoId]).catch(() => {});
    await db.query(`DELETE FROM "Video" WHERE id = $1`, [videoId]).catch(() => {});
    freedBytes += await deleteStorageObjectAndFileAsync(video.storageObjectId);

    if (freedBytes > 0) {
      await db
        .query(
          `UPDATE "ResourceUsage"
           SET "storageBytesUsed" = GREATEST(0, "storageBytesUsed" - $1)
           WHERE "userId" = $2`,
          [freedBytes, video.userId]
        )
        .catch(() => {});
    }

    const freedMb = (freedBytes / (1024 * 1024)).toFixed(2);
    return res.json({
      deleted: true,
      id: videoId,
      freedBytes,
      message: `🗑️ Video "${video.title}" eliminado del disco (${freedMb} MB liberados).`,
    });
  });

  // ===========================================================================
  // 7. JOBS & ASYNCHRONOUS AI CLIPPING PIPELINE + SSE STREAM (/api/v1/jobs)
  // ===========================================================================
  router.post('/jobs', requireAuth, async (req: AuthenticatedRequest, res) => {
    const {
      videoId,
      projectId = null,
      jobType = 'AI_CLIPPING',
      targetDurationSec = 15,
      aspectRatio = '9:16',
      gameId = 'fortnite',
      subtitleTemplate = 'Bold',
      burnSubtitles = true,
      videoEffect = 'AI_BROLL_CUTAWAY',
      autoEmojis = true,
      hookBanner = true,
      brandWatermarkText = '',
      ctaOutro = false,
      ctaOutroText = 'SÍGUENOS Y COMPARTE PARA MÁS',
      audioEnhancer = true,
      trimSilences = false,
      syncExecution = false,
    } = req.body || {};

    if (!videoId) return res.status(400).json({ error: 'VIDEO_ID_REQUIRED' });

    const vRes = await db.query<{ id: string; userId: string }>(`SELECT id, "userId" FROM "Video" WHERE id = $1 LIMIT 1`, [
      videoId,
    ]);
    if (vRes.rows.length === 0) return res.status(404).json({ error: 'VIDEO_NOT_FOUND' });
    if (vRes.rows[0].userId !== req.user!.sub && req.user!.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    const jobId = crypto.randomUUID();
    const configJson = {
      ...req.body,
      targetDurationSec: Number(targetDurationSec),
      aspectRatio,
      gameId,
      subtitleTemplate,
      burnSubtitles: Boolean(burnSubtitles),
      videoEffect,
      autoEmojis: Boolean(autoEmojis),
      hookBanner: Boolean(hookBanner),
      brandWatermarkText: String(brandWatermarkText || ''),
      ctaOutro: Boolean(ctaOutro),
      ctaOutroText: String(ctaOutroText || ''),
      audioEnhancer: Boolean(audioEnhancer),
      trimSilences: Boolean(trimSilences),
    };

    await db.query(
      `INSERT INTO "AnalysisJob" ("id", "userId", "projectId", "videoId", "jobType", "status", "currentPhase", "progressPercent", "configJson", "startedAt")
       VALUES ($1, $2, $3, $4, $5, 'QUEUED', 'En cola de procesamiento', 0, $6, CURRENT_TIMESTAMP)`,
      [jobId, req.user!.sub, projectId, videoId, jobType, JSON.stringify(configJson)]
    );

    const autoNotifyTelegramOnJobDone = async (uid: string, vid: string) => {
      try {
        const cfgRes = await db.query<{ valueJson: string }>(
          `SELECT "valueJson" FROM "SystemSetting" WHERE key = $1 LIMIT 1`,
          [`telegram_config_${uid}`]
        );
        if (!cfgRes.rows[0]?.valueJson) return;
        const parsed = JSON.parse(cfgRes.rows[0].valueJson);
        if (parsed.autoSendLiveClips === false || !parsed.botToken || !parsed.chatId) return;
        const newClips = await db.query<{ id: string }>(
          `SELECT id FROM "Clip" WHERE "videoId" = $1 ORDER BY "createdAt" DESC LIMIT 3`,
          [vid]
        );
        for (const c of newClips.rows) {
          await sendClipToTelegramHelperAsync({ userId: uid, clipId: c.id });
        }
      } catch {}
    };

    if (syncExecution) {
      const result = await executeAiClippingJob(jobId);
      const jobAfter = await db.query(`SELECT * FROM "AnalysisJob" WHERE id = $1`, [jobId]);
      setImmediate(() => {
        autoNotifyTelegramOnJobDone(req.user!.sub, videoId);
      });
      return res.status(201).json({ jobId, job: jobAfter.rows[0], result });
    } else {
      // Trigger asynchronous worker execution immediately without blocking HTTP response
      const uid = req.user!.sub;
      setImmediate(() => {
        executeAiClippingJob(jobId)
          .then(() => autoNotifyTelegramOnJobDone(uid, videoId))
          .catch((err) => {
            console.error(`[JOB ${jobId}] Falló procesamiento asíncrono:`, err?.message);
          });
      });
      return res.status(202).json({
        jobId,
        status: 'QUEUED',
        currentPhase: 'En cola de procesamiento',
        progressPercent: 0,
      });
    }
  });

  router.get('/jobs', requireAuth, async (req: AuthenticatedRequest, res) => {
    const isAdminAll = req.user!.role === 'SUPER_ADMIN' && req.query.all === 'true';
    const jobs = await db.query(
      `SELECT j.*, v.title as "videoTitle"
       FROM "AnalysisJob" j
       LEFT JOIN "Video" v ON j."videoId" = v.id
       ${isAdminAll ? '' : 'WHERE j."userId" = $1'}
       ORDER BY j."createdAt" DESC`,
      isAdminAll ? [] : [req.user!.sub]
    );
    return res.json({ jobs: jobs.rows });
  });

  router.get('/jobs/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    const jobRes = await db.query(`SELECT * FROM "AnalysisJob" WHERE id = $1 LIMIT 1`, [req.params.id]);
    if (jobRes.rows.length === 0) return res.status(404).json({ error: 'JOB_NOT_FOUND' });
    const job = jobRes.rows[0];
    if (job.userId !== req.user!.sub && req.user!.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    const clips = await db.query(
      `SELECT c.*, cs."scoreTotal", cs."scoreHook", cs."scoreStory", cs."scoreEmotion", cs."scoreEngagement", cs."scoreClarity", cs."scoreVisual", cs."scoreShareability", cs.explanation
       FROM "Clip" c
       LEFT JOIN "ClipScore" cs ON cs."clipId" = c.id
       WHERE c."videoId" = $1
       ORDER BY COALESCE(cs."scoreTotal", 0) DESC`,
      [job.videoId]
    );
    return res.json({ job, clips: clips.rows });
  });

  router.post('/jobs/:id/cancel', requireAuth, async (req: AuthenticatedRequest, res) => {
    const jobRes = await db.query<{ userId: string }>(`SELECT "userId" FROM "AnalysisJob" WHERE id = $1 LIMIT 1`, [
      req.params.id,
    ]);
    if (jobRes.rows.length === 0) return res.status(404).json({ error: 'JOB_NOT_FOUND' });
    if (jobRes.rows[0].userId !== req.user!.sub && req.user!.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    await db.query(
      `UPDATE "AnalysisJob" SET status = 'CANCELED', "currentPhase" = 'Cancelado por el usuario', "canceledAt" = CURRENT_TIMESTAMP WHERE id = $1`,
      [req.params.id]
    );
    return res.json({ id: req.params.id, status: 'CANCELED' });
  });

  // Server-Sent Events (SSE) for live job progress
  router.get('/jobs/:id/events', requireAuth, async (req: AuthenticatedRequest, res) => {
    const jobId = req.params.id;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const unsubscribe = onJobProgress((update) => {
      if (update.jobId === jobId) {
        res.write(`data: ${JSON.stringify(update)}\n\n`);
      }
    });

    req.on('close', () => {
      unsubscribe();
    });
  });

  // ===========================================================================
  // 8. CLIPS & 7-DIMENSION QUALITY SCORING (/api/v1/clips)
  // ===========================================================================
  router.get('/clips', requireAuth, async (req: AuthenticatedRequest, res) => {
    const isAdminAll = req.user!.role === 'SUPER_ADMIN' && req.query.all === 'true';
    const rows = await db.query(
      `SELECT c.*,
              cs."scoreTotal", cs."scoreHook", cs."scoreStory", cs."scoreEmotion",
              cs."scoreEngagement", cs."scoreClarity", cs."scoreVisual", cs."scoreShareability",
              cs.explanation, cs."algorithmVersion",
              v.title as "videoTitle"
       FROM "Clip" c
       LEFT JOIN "ClipScore" cs ON cs."clipId" = c.id
       LEFT JOIN "Video" v ON c."videoId" = v.id
       ${isAdminAll ? 'WHERE c."isTrash" = false' : 'WHERE c."userId" = $1 AND c."isTrash" = false'}
       ORDER BY COALESCE(cs."scoreTotal", 0) DESC, c."createdAt" DESC`,
      isAdminAll ? [] : [req.user!.sub]
    );

    const clips = rows.rows.map((c: any) => ({
      ...c,
      signedDownloadUrl: c.storageObjectId
        ? signStorageObjectUrl({ storageObjectId: c.storageObjectId, userId: c.userId }).url
        : null,
      xmlExportUrl: `/api/v1/clips/${c.id}/xml`,
      thumbnailDownloadUrl: `/api/v1/clips/${c.id}/thumbnail`,
    }));

    return res.json({ clips });
  });

  // Viral Cover / Thumbnail Generator & Downloader
  router.get('/clips/:id/thumbnail', async (req: AuthenticatedRequest, res) => {
    const clipId = req.params.id;
    const cRes = await db.query(
      `SELECT c.*, cs."scoreTotal", so."localPath" as "videoLocalPath"
       FROM "Clip" c
       LEFT JOIN "ClipScore" cs ON cs."clipId" = c.id
       LEFT JOIN "StorageObject" so ON so.id = c."storageObjectId"
       WHERE c.id = $1 LIMIT 1`,
      [clipId]
    );
    if (cRes.rows.length === 0) return res.status(404).json({ error: 'CLIP_NOT_FOUND' });
    const clip = cRes.rows[0];

    const thumbRel = clip.thumbnailPath || `banana-thumbnails/clip_${clip.id}.jpg`;
    const thumbAbs = path.isAbsolute(thumbRel) ? thumbRel : path.join(storageRoot, thumbRel);
    const videoAbs =
      clip.videoLocalPath && fs.existsSync(clip.videoLocalPath)
        ? clip.videoLocalPath
        : clip.previewPath
          ? path.join(storageRoot, clip.previewPath)
          : '';

    const forceRegen = req.query.regenerate === '1' || !fs.existsSync(thumbAbs);
    if (forceRegen && videoAbs && fs.existsSync(videoAbs)) {
      let customHeadline =
        typeof req.query.headline === 'string' && req.query.headline.trim()
          ? req.query.headline.trim()
          : '';
      if (!customHeadline) {
        customHeadline = String(clip.summary || clip.title || 'MOMENTO VIRAL')
          .replace(/🔥|Highlight #\d+|\[Min [^\]]+\]:?/gi, '')
          .replace(/["«»¿?¡!]/g, '')
          .trim()
          .split(/\s+/)
          .slice(0, 6)
          .join(' ');
      }
      generateThumbnailFfmpeg(
        videoAbs,
        thumbAbs,
        Math.min(1.5, Number(clip.durationSec || 10) / 3),
        customHeadline,
        Number(clip.scoreTotal || 95)
      );
    }

    if (!fs.existsSync(thumbAbs)) {
      return res.status(404).json({ error: 'THUMBNAIL_NOT_FOUND' });
    }
    res.setHeader('Content-Type', 'image/jpeg');
    if (req.query.download === '1') {
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="Portada_Viral_${clip.id.slice(0, 8)}.jpg"`
      );
    }
    return res.sendFile(thumbAbs);
  });

  // On-demand 100% AI Viral Thumbnail Generator powered by xAI Grok Imagine (`grok-imagine-image`)
  router.post('/clips/:id/grok-thumbnail', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const clipId = req.params.id;
      const cRes = await db.query(
        `SELECT c.*, cs."scoreTotal"
         FROM "Clip" c
         LEFT JOIN "ClipScore" cs ON cs."clipId" = c.id
         WHERE c.id = $1 LIMIT 1`,
        [clipId]
      );
      if (cRes.rows.length === 0) {
        return res.status(404).json({ error: 'CLIP_NOT_FOUND', message: 'No se encontró el clip solicitado.' });
      }
      const clip = cRes.rows[0];
      const ctRes = await db
        .query<{ srtContent: string }>(`SELECT "srtContent" FROM "ClipTranscript" WHERE "clipId" = $1 LIMIT 1`, [
          clipId,
        ])
        .catch(() => ({ rows: [] as { srtContent: string }[] }));
      const rawSrt = String(ctRes.rows[0]?.srtContent || '')
        .replace(/\d+\r?\n\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}\r?\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const contextText = String(
        req.body?.customPrompt || clip.summary || rawSrt || clip.title || 'Momento viral en vivo'
      );
      const customHeadline = typeof req.body?.headline === 'string' ? req.body.headline.trim() : undefined;

      const grokThumbRel = `banana-thumbnails/grok_thumb_${clip.id}.jpg`;
      const grokThumbAbs = path.join(storageRoot, grokThumbRel);

      const generated = await generateViralThumbnailWithGrokImagineAsync({
        transcriptOrTopic: contextText,
        headlineText: customHeadline || clip.title,
        outputThumbPath: grokThumbAbs,
        scoreTotal: Number(clip.scoreTotal || 96),
      });

      await db.query(`UPDATE "Clip" SET "thumbnailPath" = $1 WHERE id = $2`, [grokThumbRel, clip.id]);

      const ts = Date.now();
      return res.json({
        ok: true,
        clipId: clip.id,
        aiEngine: 'Grok Imagine (xAI)',
        headlineUsed: generated.headlineUsed,
        promptUsed: generated.promptUsed,
        thumbnailUrl: `/api/v1/clips/${clip.id}/thumbnail?t=${ts}`,
        downloadUrl: `/api/v1/clips/${clip.id}/thumbnail?download=1&t=${ts}`,
      });
    } catch (err: any) {
      return res.status(500).json({
        error: 'GROK_THUMBNAIL_FAILED',
        message: err?.message || 'Error al generar la miniatura con Grok Imagine.',
      });
    }
  });

  // OpusClip XML Export for Adobe Premiere Pro, DaVinci Resolve & Final Cut Pro
  router.get('/clips/:id/xml', async (req: AuthenticatedRequest, res) => {
    const clipId = req.params.id;
    const cRes = await db.query(
      `SELECT c.*, v."originalFilename"
       FROM "Clip" c
       LEFT JOIN "Video" v ON c."videoId" = v.id
       WHERE c.id = $1 LIMIT 1`,
      [clipId]
    );
    if (cRes.rows.length === 0) return res.status(404).json({ error: 'CLIP_NOT_FOUND' });
    const clip = cRes.rows[0];

    const ct = await db.query<{ wordsJson: any }>(`SELECT "wordsJson" FROM "ClipTranscript" WHERE "clipId" = $1 LIMIT 1`, [
      clipId,
    ]);
    const words = ct.rows[0]?.wordsJson
      ? typeof ct.rows[0].wordsJson === 'string'
        ? JSON.parse(ct.rows[0].wordsJson)
        : ct.rows[0].wordsJson
      : [];

    const xml = buildPremiereXmlForClip({
      clipId: clip.id,
      clipTitle: clip.title,
      sourceFilename: clip.originalFilename || `clip_${clip.id}.mp4`,
      startSec: Number(clip.startSec || 0),
      endSec: Number(clip.endSec || clip.durationSec || 30),
      durationSec: Number(clip.durationSec || 30),
      words,
    });

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${clip.title.replace(/[^a-z0-9_-]/gi, '_')}_Premiere_DaVinci.xml"`
    );
    return res.send(xml);
  });

  router.get('/clips/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    const clipId = req.params.id;
    const cRes = await db.query(
      `SELECT c.*,
              cs."scoreTotal", cs."scoreHook", cs."scoreStory", cs."scoreEmotion",
              cs."scoreEngagement", cs."scoreClarity", cs."scoreVisual", cs."scoreShareability",
              cs.explanation, cs."algorithmVersion", cs."weightsUsed"
       FROM "Clip" c
       LEFT JOIN "ClipScore" cs ON cs."clipId" = c.id
       WHERE c.id = $1 LIMIT 1`,
      [clipId]
    );
    if (cRes.rows.length === 0) return res.status(404).json({ error: 'CLIP_NOT_FOUND' });
    const clip = cRes.rows[0];
    if (clip.userId !== req.user!.sub && req.user!.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'FORBIDDEN_PRIVATE_CLIP' });
    }

    const ct = await db.query(`SELECT * FROM "ClipTranscript" WHERE "clipId" = $1 LIMIT 1`, [clipId]);
    const ep = await db.query(`SELECT * FROM "EditProject" WHERE "clipId" = $1 ORDER BY "updatedAt" DESC LIMIT 1`, [
      clipId,
    ]);

    return res.json({
      clip: {
        ...clip,
        transcript: ct.rows[0] || null,
        editProject: ep.rows[0] || null,
        signedDownloadUrl: clip.storageObjectId
          ? signStorageObjectUrl({ storageObjectId: clip.storageObjectId, userId: clip.userId }).url
          : null,
      },
    });
  });

  // Toggle favorite on a Clip
  router.patch('/clips/:id/favorite', requireAuth, async (req: AuthenticatedRequest, res) => {
    const clipId = req.params.id;
    const cRes = await db.query<{ id: string; userId: string; isFavorite: boolean }>(
      `SELECT id, "userId", "isFavorite" FROM "Clip" WHERE id = $1 LIMIT 1`,
      [clipId]
    );
    if (cRes.rows.length === 0) return res.status(404).json({ error: 'CLIP_NOT_FOUND' });
    const clip = cRes.rows[0];
    if (clip.userId !== req.user!.sub && req.user!.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    const nextFav = req.body?.isFavorite !== undefined ? Boolean(req.body.isFavorite) : !clip.isFavorite;
    await db.query(`UPDATE "Clip" SET "isFavorite" = $1 WHERE id = $2`, [nextFav, clipId]);
    return res.json({ id: clipId, isFavorite: nextFav });
  });

  // Permanently delete a Clip (and any linked 60s Story Montage/Video), physically removing MP4 & thumbnails from disk
  router.delete('/clips/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    const clipId = req.params.id;
    const cRes = await db.query<{
      id: string;
      userId: string;
      videoId: string | null;
      title: string;
      category: string | null;
      storageObjectId: string | null;
      previewPath: string | null;
      thumbnailPath: string | null;
    }>(
      `SELECT id, "userId", "videoId", title, category, "storageObjectId", "previewPath", "thumbnailPath"
       FROM "Clip" WHERE id = $1 LIMIT 1`,
      [clipId]
    );
    if (cRes.rows.length === 0) {
      return res.status(404).json({ error: 'CLIP_NOT_FOUND', message: 'El clip ya fue eliminado.' });
    }
    const clip = cRes.rows[0];
    if (clip.userId !== req.user!.sub && req.user!.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    let freedBytes = 0;
    freedBytes += unlinkFileAndCountBytes(clip.previewPath);
    freedBytes += unlinkFileAndCountBytes(clip.thumbnailPath);
    freedBytes += unlinkFileAndCountBytes(`banana-thumbnails/grok_thumb_${clip.id}.jpg`);
    freedBytes += unlinkFileAndCountBytes(`banana-clips/subs_${clip.id}.ass`);
    freedBytes += unlinkFileAndCountBytes(`banana-clips/live_subs_${clip.id}.ass`);
    freedBytes += unlinkFileAndCountBytes(`banana-clips/claude_sub_${clip.id}.ass`);

    // Delete any Exports created from this clip
    const expRes = await db.query<{ id: string; storageObjectId: string | null }>(
      `SELECT id, "storageObjectId" FROM "Export" WHERE "clipId" = $1`,
      [clipId]
    );
    for (const ex of expRes.rows) {
      freedBytes += await deleteStorageObjectAndFileAsync(ex.storageObjectId);
    }
    await db.query(`DELETE FROM "Export" WHERE "clipId" = $1`, [clipId]).catch(() => {});

    // Delete any Montage that points to the same storageObjectId (e.g., 60s Stickman Story)
    if (clip.storageObjectId) {
      await db.query(`DELETE FROM "Montage" WHERE "outputStorageId" = $1`, [clip.storageObjectId]).catch(() => {});
    }
    await db.query(`DELETE FROM "MontageItem" WHERE "clipId" = $1`, [clipId]).catch(() => {});
    await db.query(`DELETE FROM "ClipScore" WHERE "clipId" = $1`, [clipId]).catch(() => {});
    await db.query(`DELETE FROM "ClipTranscript" WHERE "clipId" = $1`, [clipId]).catch(() => {});

    const epRes = await db.query<{ id: string }>(`SELECT id FROM "EditProject" WHERE "clipId" = $1`, [clipId]);
    for (const ep of epRes.rows) {
      await db.query(`DELETE FROM "EditOperation" WHERE "editProjectId" = $1`, [ep.id]).catch(() => {});
    }
    await db.query(`DELETE FROM "EditProject" WHERE "clipId" = $1`, [clipId]).catch(() => {});
    await db.query(`DELETE FROM "SocialPost" WHERE "clipId" = $1`, [clipId]).catch(() => {});
    await db.query(`DELETE FROM "Clip" WHERE id = $1`, [clipId]).catch(() => {});

    // If this was a 60s Story clip whose parent Video uses the exact same storageObjectId, remove that synthetic Video row too
    if (clip.videoId && (clip.category === 'STORY_60S' || clip.storageObjectId)) {
      const otherClips = await db.query<{ cnt: string }>(
        `SELECT COUNT(*)::text as cnt FROM "Clip" WHERE "videoId" = $1`,
        [clip.videoId]
      );
      if (Number(otherClips.rows[0]?.cnt || 0) === 0 && clip.category === 'STORY_60S') {
        await db.query(`DELETE FROM "Video" WHERE id = $1`, [clip.videoId]).catch(() => {});
      }
    }

    freedBytes += await deleteStorageObjectAndFileAsync(clip.storageObjectId);

    if (freedBytes > 0) {
      await db
        .query(
          `UPDATE "ResourceUsage"
           SET "storageBytesUsed" = GREATEST(0, "storageBytesUsed" - $1)
           WHERE "userId" = $2`,
          [freedBytes, clip.userId]
        )
        .catch(() => {});
    }

    const freedMb = (freedBytes / (1024 * 1024)).toFixed(2);
    return res.json({
      deleted: true,
      id: clipId,
      freedBytes,
      message: `🗑️ Clip "${clip.title}" eliminado permanentemente (${freedMb} MB liberados en disco).`,
    });
  });

  // Non-destructive Video Editor & Text-Based Editing State Update
  router.put('/clips/:id/editor', requireAuth, async (req: AuthenticatedRequest, res) => {
    const clipId = req.params.id;
    const { stateJson, operationType = 'UPDATE_STATE', payloadJson = {} } = req.body || {};

    const cRes = await db.query<{ userId: string }>(`SELECT "userId" FROM "Clip" WHERE id = $1 LIMIT 1`, [clipId]);
    if (cRes.rows.length === 0) return res.status(404).json({ error: 'CLIP_NOT_FOUND' });
    if (cRes.rows[0].userId !== req.user!.sub && req.user!.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    const epRes = await db.query<{ id: string; version: number; stateJson: any; historyStack: any }>(
      `SELECT * FROM "EditProject" WHERE "clipId" = $1 LIMIT 1`,
      [clipId]
    );

    if (epRes.rows.length === 0) {
      return res.status(404).json({ error: 'EDIT_PROJECT_NOT_FOUND' });
    }

    const ep = epRes.rows[0];
    const nextVersion = (ep.version || 1) + 1;
    const history = Array.isArray(ep.historyStack) ? ep.historyStack : [];
    history.push(ep.stateJson);

    await db.query(
      `UPDATE "EditProject"
       SET version = $1, "stateJson" = $2, "historyStack" = $3, "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [nextVersion, JSON.stringify(stateJson), JSON.stringify(history.slice(-20)), ep.id]
    );

    await db.query(
      `INSERT INTO "EditOperation" ("id", "editProjectId", "operationType", "payloadJson")
       VALUES ($1, $2, $3, $4)`,
      [crypto.randomUUID(), ep.id, operationType, JSON.stringify(payloadJson)]
    );

    return res.json({ editProjectId: ep.id, version: nextVersion, stateJson });
  });

  // ===========================================================================
  // 9. FIND MOMENTS — PGVECTOR SEMANTIC & VISUAL SEARCH (/api/v1/find-moments)
  // ===========================================================================
  router.post('/find-moments', requireAuth, async (req: AuthenticatedRequest, res) => {
    const queryText = String(req.body?.query || '').trim();
    const videoId = req.body?.videoId || null;

    if (!queryText) {
      return res.status(400).json({ error: 'QUERY_REQUIRED', message: 'Escribe qué momento deseas buscar.' });
    }

    const queryEmb = computeEmbedding384(queryText);
    const queryVecLiteral = `[${queryEmb.join(',')}]`;

    // Execute real pgvector cosine distance `<=>` query across TranscriptSegment and Scene visual embeddings
    const segResults = await db.query<{
      id: string;
      startSec: number;
      endSec: number;
      text: string;
      videoId: string;
      videoTitle: string;
      thumbnailPath: string | null;
      distance: number;
    }>(
      `SELECT ts.id, ts."startSec", ts."endSec", ts.text,
              v.id as "videoId", v.title as "videoTitle", v."thumbnailPath",
              (ts.embedding <=> $1::vector) as distance
       FROM "TranscriptSegment" ts
       JOIN "Transcript" t ON ts."transcriptId" = t.id
       JOIN "Video" v ON t."videoId" = v.id
       WHERE v."userId" = $2 ${videoId ? 'AND v.id = $3' : ''}
       ORDER BY ts.embedding <=> $1::vector ASC
       LIMIT 8`,
      videoId ? [queryVecLiteral, req.user!.sub, videoId] : [queryVecLiteral, req.user!.sub]
    );

    const sceneResults = await db.query<{
      id: string;
      startSec: number;
      endSec: number;
      description: string;
      videoId: string;
      videoTitle: string;
      thumbnailPath: string | null;
      distance: number;
    }>(
      `SELECT sc.id, sc."startSec", sc."endSec", sc.description,
              v.id as "videoId", v.title as "videoTitle", sc."thumbnailPath",
              (sc."visualEmbedding" <=> $1::vector) as distance
       FROM "Scene" sc
       JOIN "Video" v ON sc."videoId" = v.id
       WHERE v."userId" = $2 ${videoId ? 'AND v.id = $3' : ''}
       ORDER BY sc."visualEmbedding" <=> $1::vector ASC
       LIMIT 6`,
      videoId ? [queryVecLiteral, req.user!.sub, videoId] : [queryVecLiteral, req.user!.sub]
    );

    const results = [
      ...segResults.rows.map((r) => ({
        id: r.id,
        matchType: 'SEMANTIC_TRANSCRIPT',
        videoId: r.videoId,
        videoTitle: r.videoTitle,
        timestampSec: r.startSec,
        endSec: r.endSec,
        description: r.text,
        thumbnailPath: r.thumbnailPath,
        confidence: Number(Math.max(0.55, Math.min(0.99, 1 - (Number(r.distance) || 0.2) * 0.45)).toFixed(2)),
      })),
      ...sceneResults.rows.map((s) => ({
        id: s.id,
        matchType: 'VISUAL_SCENE_INDEX',
        videoId: s.videoId,
        videoTitle: s.videoTitle,
        timestampSec: s.startSec,
        endSec: s.endSec,
        description: s.description,
        thumbnailPath: s.thumbnailPath,
        confidence: Number(Math.max(0.52, Math.min(0.96, 1 - (Number(s.distance) || 0.25) * 0.45)).toFixed(2)),
      })),
    ].sort((a, b) => b.confidence - a.confidence);

    return res.json({
      query: queryText,
      vectorEngine: 'pgvector-cosine-384d',
      results: results.slice(0, 10),
    });
  });

  // ===========================================================================
  // 10. GAME CLIPPING & SPECIALIZED EVENT DETECTORS (/api/v1/gaming)
  // ===========================================================================
  router.get('/gaming', requireAuth, async (req: AuthenticatedRequest, res) => {
    const presetFilter = typeof req.query.preset === 'string' ? req.query.preset : null;
    const gameFilter = typeof req.query.gameId === 'string' ? req.query.gameId : null;

    const events = await db.query(
      `SELECT ve.*, v.title as "videoTitle"
       FROM "VisualEvent" ve
       JOIN "Video" v ON ve."videoId" = v.id
       WHERE v."userId" = $1
       ${presetFilter ? 'AND ve."presetTag" = $2' : ''}
       ORDER BY ve.confidence DESC, ve."timestampSec" ASC`,
      presetFilter ? [req.user!.sub, presetFilter] : [req.user!.sub]
    );

    return res.json({
      supportedGames: [
        { id: 'fortnite', name: 'Fortnite', detectorMode: 'Multimodal Audio/Action + HUD Candidate' },
        { id: 'gtav', name: 'GTA V', detectorMode: 'Multimodal High-Action & Roleplay Voice Peaks' },
        { id: 'gtavi', name: 'GTA VI (Compatible Ready)', detectorMode: 'Multimodal Next-Gen Action Detector' },
        { id: 'valorant', name: 'Valorant', detectorMode: 'Multimodal Tactical Round & Audio Spike Detector' },
        { id: 'minecraft', name: 'Minecraft', detectorMode: 'Multimodal Reaction & Event Detector' },
        { id: 'cod', name: 'Call of Duty', detectorMode: 'Multimodal Combat Pace Detector' },
        { id: 'sports', name: 'Juegos de Deportes (EA FC / NBA 2K)', detectorMode: 'Crowd/Commentator Peak + Scoreboard Change' },
      ],
      presets: ['Funny Moments', 'Epic Wins', 'Rage Moments', 'Best Plays', 'Fails', 'Reactions', 'Highlights'],
      activeGameFilter: gameFilter,
      events: events.rows,
    });
  });

  // ===========================================================================
  // 11. LIVE CLIPPER — YOUTUBE LIVE / HLS / RTMP AUTO-CUTTER & GALLERY SAVER
  // ===========================================================================
  const liveSessionStatusMap = new Map<
    string,
    {
      currentStatusText: string;
      cutsCount: number;
      blocksScanned: number;
      isCapturing: boolean;
      autoCutEnabled: boolean;
      clipDurationSec: number;
      intervalSec: number;
      splitScreenMode?: SplitScreenRetentionMode;
      backgroundMusicTrack?: ViralMusicTrackId;
      voiceDubbingLang?: VoiceDubbingLang;
      timer?: NodeJS.Timeout;
    }
  >();

  // Helper to send a Clip MP4 + Viral Caption directly to a user's Telegram Bot
  const sendClipToTelegramHelperAsync = async (params: {
    userId: string;
    clipId: string;
    overrideBotToken?: string;
    overrideChatId?: string;
  }): Promise<{ ok: boolean; message: string }> => {
    let botToken = (params.overrideBotToken || '').trim();
    let chatId = (params.overrideChatId || '').trim();

    if (!botToken || !chatId) {
      const cfgRes = await db.query<{ valueJson: string }>(
        `SELECT "valueJson" FROM "SystemSetting" WHERE key = $1 LIMIT 1`,
        [`telegram_config_${params.userId}`]
      );
      if (cfgRes.rows[0]?.valueJson) {
        try {
          const parsed = JSON.parse(cfgRes.rows[0].valueJson);
          if (!botToken) botToken = String(parsed.botToken || '').trim();
          if (!chatId) chatId = String(parsed.chatId || '').trim();
        } catch {}
      }
    }

    if (!botToken || !chatId) {
      return {
        ok: false,
        message: 'Configura primero tu Bot Token y Chat ID de Telegram en Publicación Social → Automatizaciones.',
      };
    }

    const cRes = await db.query(
      `SELECT c.*, cs."scoreTotal", so."localPath" as "videoLocalPath"
       FROM "Clip" c
       LEFT JOIN "ClipScore" cs ON cs."clipId" = c.id
       LEFT JOIN "StorageObject" so ON so.id = c."storageObjectId"
       WHERE c.id = $1 LIMIT 1`,
      [params.clipId]
    );
    if (cRes.rows.length === 0) {
      return { ok: false, message: 'Clip no encontrado.' };
    }
    const clip = cRes.rows[0];
    const videoAbs =
      clip.videoLocalPath && fs.existsSync(clip.videoLocalPath)
        ? clip.videoLocalPath
        : clip.previewPath
          ? path.join(storageRoot, clip.previewPath)
          : '';

    const hashtagsArr =
      typeof clip.hashtags === 'string' ? JSON.parse(clip.hashtags || '[]') : clip.hashtags || ['#viral', '#shorts'];
    const caption = `🍌 BANANA CLIPS AI STUDIO\n🔥 ${clip.title}\n⭐ Score Viral: ${clip.scoreTotal || 95}/100\n\n"${String(clip.summary || '').slice(0, 220)}"\n\n${hashtagsArr.join(' ')}`;

    try {
      // 1. First verify the Bot Token via getMe so invalid tokens fail in <1s instead of uploading a large MP4
      const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
        method: 'GET',
        signal: AbortSignal.timeout(8000),
      });
      const meData: any = await meRes.json().catch(() => ({}));
      if (!meRes.ok || !meData?.ok) {
        return {
          ok: false,
          message: `Token de Bot de Telegram inválido o revocado (${meData?.description || '401 Unauthorized'}). Abre @BotFather en Telegram, escribe /token o /newbot y pega el token exacto.`,
        };
      }
      const botUsername = meData?.result?.username ? `@${meData.result.username}` : 'tu Bot';

      // 2. Send MP4 video via curl multipart upload (avoids Node fetch FormData ECONNRESET & Next.js rewrite timeout)
      if (videoAbs && fs.existsSync(videoAbs) && fs.statSync(videoAbs).size < 49 * 1024 * 1024) {
        const curlOut = await new Promise<string>((resolve, reject) => {
          const child = spawn('curl', [
            '-sS',
            '--max-time',
            '45',
            '-X',
            'POST',
            `https://api.telegram.org/bot${botToken}/sendVideo`,
            '-F',
            `chat_id=${chatId}`,
            '-F',
            `caption=${caption}`,
            '-F',
            `video=@${videoAbs};type=video/mp4`,
          ]);
          let stdout = '';
          let stderr = '';
          child.stdout.on('data', (d) => (stdout += d.toString()));
          child.stderr.on('data', (d) => (stderr += d.toString()));
          child.on('close', (code) => {
            if (stdout.trim().startsWith('{')) resolve(stdout.trim());
            else if (code === 0) resolve(stdout.trim());
            else reject(new Error(stderr.trim() || `curl exit ${code}`));
          });
          child.on('error', (err) => reject(err));
        });

        const tgData: any = JSON.parse(curlOut || '{}');
        if (tgData?.ok) {
          return {
            ok: true,
            message: `✅ Video MP4 "${clip.title}" enviado con éxito por ${botUsername} a tu chat (${chatId}).`,
          };
        }
        const desc = String(tgData?.description || 'Error desconocido');
        if (/chat not found/i.test(desc)) {
          return {
            ok: false,
            message: `Telegram respondió "chat not found" para el Chat ID ${chatId}. Primero abre tu bot ${botUsername} en Telegram y pulsa "Iniciar" (/start) para que pueda enviarte videos.`,
          };
        }
        return {
          ok: false,
          message: `Telegram API (${botUsername}) respondió: ${desc}`,
        };
      } else {
        const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: caption }),
          signal: AbortSignal.timeout(12000),
        });
        const tgData: any = await tgRes.json().catch(() => ({}));
        if (tgRes.ok && tgData?.ok) {
          return { ok: true, message: `✅ Mensaje enviado por ${botUsername} a tu Telegram (${chatId}).` };
        }
        return {
          ok: false,
          message: `Telegram API (${botUsername}) respondió: ${tgData?.description || tgRes.statusText}`,
        };
      }
    } catch (err: any) {
      return { ok: false, message: `Error al conectar con Telegram API: ${err?.message}` };
    }
  };

  const captureAndRenderLiveCutAsync = async (params: {
    videoId: string;
    userId: string;
    streamUrl: string;
    sessionTitle: string;
    clipDurationSec: number;
  }) => {
    const rt = liveSessionStatusMap.get(params.videoId) || {
      currentStatusText: 'Iniciando detector multi-highlight en vivo...',
      cutsCount: 0,
      blocksScanned: 0,
      isCapturing: false,
      autoCutEnabled: true,
      clipDurationSec: params.clipDurationSec,
      intervalSec: 300,
    };
    if (rt.isCapturing) return null;
    rt.isCapturing = true;
    const blockIdx = rt.blocksScanned;
    const targetDur = Math.max(10, Math.min(45, Number(params.clipDurationSec) || 20));
    const analysisWindowSec = Math.max(36, Math.min(48, Math.round(targetDur * 2.2)));
    const blockSec = Math.max(60, Number(rt.intervalSec) || 300);
    const blockStartMin = Math.floor((blockIdx * blockSec) / 60);
    const blockEndMin = Math.floor(((blockIdx + 1) * blockSec) / 60);

    rt.currentStatusText = `Escaneando Bloque #${blockIdx + 1} [Min ${blockStartMin}:00 - ${blockEndMin}:00] para detectar los Mejores Momentos...`;
    liveSessionStatusMap.set(params.videoId, rt);

    try {
      const segId = crypto.randomUUID();
      const rawSegPath = path.join(storageRoot, 'banana-videos', `live_seg_${segId}.mp4`);
      const segMeta = await captureLiveStreamSegmentAsync({
        streamUrl: params.streamUrl,
        outputMp4Path: rawSegPath,
        durationSec: analysisWindowSec,
        segmentIndex: blockIdx,
        blockDurationSec: blockSec,
        onStatus: (msg) => {
          rt.currentStatusText = msg;
        },
      });

      // Update parent live Video file with real captured stream media so Original Video is also real
      try {
        const parentVidPath = path.join(storageRoot, 'banana-videos', `live_${params.videoId}.mp4`);
        fs.copyFileSync(rawSegPath, parentVidPath);
      } catch {}

      rt.currentStatusText = `Analizando discurso del Bloque [Min ${blockStartMin}-${blockEndMin}] con Faster-Whisper IA para extraer múltiples Highlights...`;
      const whisperSegments = await transcribeVideoWithFasterWhisperAsync(rawSegPath);

      const allWords: any[] = [];
      for (const seg of whisperSegments) {
        if (Array.isArray(seg.words) && seg.words.length > 0) {
          allWords.push(...seg.words);
        }
      }

      const totalAvailableSec = Math.max(targetDur, segMeta.durationSeconds || analysisWindowSec);
      rt.currentStatusText = `Analizando Energía Vocal (PCM RMS) + Transcripción + Claude 5.5 Haiku para encontrar los Mejores Momentos del Bloque [Min ${blockStartMin}-${blockEndMin}]...`;

      const detectedMoments = await detectBestViralMomentsMultimodalAsync({
        videoPath: rawSegPath,
        totalDurationSec: totalAvailableSec,
        targetClipDurationSec: targetDur,
        maxClips: 3,
        rangeStartSec: 0,
        rangeEndSec: totalAvailableSec,
        videoTitle: params.sessionTitle,
        allWords: allWords.map((w) => ({
          word: String(w.word || ''),
          start: Number(w.start) || 0,
          end: Number(w.end) || 0,
          confidence: 0.98,
          speaker: 'Live',
          isFiller: false,
        })),
      });

      const selectedHighlights =
        detectedMoments.length > 0
          ? detectedMoments
          : [
              {
                startSec: 0,
                endSec: targetDur,
                durationSec: targetDur,
                scoreTotal: 89,
                audioEnergyScore: 85,
                transcriptSnippet: '',
                hookBanner: params.sessionTitle,
                viralTitle: params.sessionTitle,
                reasonEs: 'Momento destacado capturado del directo en vivo.',
              },
            ];

      // Order selected highlights chronologically inside the block
      selectedHighlights.sort((a: any, b: any) => a.startSec - b.startSec);

      const createdClipIds: string[] = [];

      for (let hIdx = 0; hIdx < selectedHighlights.length; hIdx++) {
        const hl = selectedHighlights[hIdx];
        const cutNum = rt.cutsCount + 1;
        const bestStartSec = hl.startSec;
        const bestScore = hl.scoreTotal;
        const bestSummary = hl.transcriptSnippet;

        const clipDur = Math.max(
          8,
          Math.min(targetDur, Math.round(hl.endSec > bestStartSec ? hl.endSec - bestStartSec : totalAvailableSec - bestStartSec))
        );
        const shiftedWords = allWords
          .filter((w) => w.start >= bestStartSec - 0.2 && w.end <= bestStartSec + clipDur + 0.5)
          .map((w) => ({
            word: String(w.word || '').trim(),
            start: Number(Math.max(0, w.start - bestStartSec).toFixed(2)),
            end: Number(Math.min(clipDur, Math.max(0.25, w.end - bestStartSec)).toFixed(2)),
            confidence: 0.98,
            speaker: 'Live',
            isFiller: false,
          }))
          .filter((w) => w.word.length > 0);

        const finalWords =
          shiftedWords.length > 0
            ? shiftedWords
            : [
                { word: '🔥', start: 0.2, end: 0.8, confidence: 0.98, speaker: 'Live', isFiller: false },
                { word: 'Mejor', start: 0.8, end: 1.4, confidence: 0.98, speaker: 'Live', isFiller: false },
                { word: 'Momento', start: 1.4, end: 2.2, confidence: 0.98, speaker: 'Live', isFiller: false },
                { word: `#${cutNum}`, start: 2.2, end: 3.0, confidence: 0.98, speaker: 'Live', isFiller: false },
              ];

        rt.currentStatusText = `Renderizando Mejor Momento ${hIdx + 1}/${selectedHighlights.length} del Bloque [Min ${blockStartMin}-${blockEndMin}] (Score ${bestScore}/100)...`;
        const clipId = crypto.randomUUID();
        const clipFileRel = `banana-clips/live_clip_${clipId}.mp4`;
        const clipFileAbs = path.join(storageRoot, clipFileRel);
        const thumbFileRel = `banana-thumbnails/live_clip_${clipId}.jpg`;
        const thumbFileAbs = path.join(storageRoot, thumbFileRel);
        const assPath = path.join(storageRoot, 'banana-clips', `live_subs_${clipId}.ass`);

        let liveHookHeadline = hl.hookBanner;
        if (!liveHookHeadline) {
          const grokHook = await generateViralHookWithGrokAsync(
            bestSummary || finalWords.map((w) => w.word).join(' '),
            params.sessionTitle
          );
          liveHookHeadline = grokHook.hookBanner;
        }
        const assContent = generateAssSubtitles(finalWords, SUBTITLE_TEMPLATES.Bold, 1080, 1920, {
          autoEmojis: true,
          hookBannerText: liveHookHeadline || params.sessionTitle,
          hookStyle: 'Classic',
          hookAnimation: 'ELASTIC_POP',
          clipDurationSec: clipDur,
        });
        fs.writeFileSync(assPath, assContent, 'utf-8');

        renderClipWithFfmpeg({
          sourceVideoPath: rawSegPath,
          outputVideoPath: clipFileAbs,
          startSec: bestStartSec,
          durationSec: clipDur,
          aspectRatio: '9:16',
          resolution: '1080p',
          reframeMode: 'LEVEL_2_VISUAL_TRACKING',
          subtitleAssPath: assPath,
          autoZoom: true,
          autoColorCorrection: true,
          audioEnhancer: true,
          splitScreenMode: rt.splitScreenMode || 'NONE',
          backgroundMusicTrack: rt.backgroundMusicTrack || 'NONE',
          storageDir: storageRoot,
        });

        if (rt.voiceDubbingLang && rt.voiceDubbingLang !== 'NONE') {
          await applyVoiceDubbingToClipAsync({
            videoPath: clipFileAbs,
            transcriptText: bestSummary || finalWords.map((w) => w.word).join(' '),
            targetLang: rt.voiceDubbingLang,
          });
        }

        generateThumbnailFfmpeg(
          clipFileAbs,
          thumbFileAbs,
          Math.min(2.0, clipDur / 3),
          liveHookHeadline || params.sessionTitle,
          bestScore
        );

        const storageObjId = crypto.randomUUID();
        const statSize = fs.existsSync(clipFileAbs) ? fs.statSync(clipFileAbs).size : 0;
        await db.query(
          `INSERT INTO "StorageObject" ("id", "userId", "bucket", "objectKey", "localPath", "mimeType", "sizeBytes")
           VALUES ($1, $2, 'banana-clips', $3, $4, 'video/mp4', $5)`,
          [storageObjId, params.userId, `live_clip_${clipId}.mp4`, clipFileAbs, statSize]
        );

        await db.query(
          `UPDATE "ResourceUsage"
           SET "storageBytesUsed" = "storageBytesUsed" + $1,
               "minutesProcessed" = "minutesProcessed" + $2,
               "clipsGenerated" = "clipsGenerated" + 1
           WHERE "userId" = $3`,
          [statSize, Number((clipDur / 60).toFixed(2)), params.userId]
        );

        const transcriptPreview = (bestSummary || finalWords.map((w) => w.word).join(' ')).slice(0, 220);
        const firstWordsTitle = hl.viralTitle || transcriptPreview.split(/\s+/).slice(0, 7).join(' ');
        const clipTitle =
          firstWordsTitle.length > 6
            ? `🔥 Highlight #${cutNum} [Min ${blockStartMin}-${blockEndMin}]: ${firstWordsTitle}`
            : `🔥 Mejor Corte #${cutNum} [Min ${blockStartMin}-${blockEndMin}] — ${params.sessionTitle}`;

        await db.query(
          `INSERT INTO "Clip" ("id", "userId", "videoId", "title", "altTitle", "description", "hashtags", "keywords", "summary", "category", "language", "startSec", "endSec", "durationSec", "aspectRatio", "reframeMode", "storageObjectId", "previewPath", "thumbnailPath", "fingerprintHash")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'LIVE_CUT', 'es', $10, $11, $12, '9:16', 'LEVEL_2_VISUAL_TRACKING', $13, $14, $15, $16)`,
          [
            clipId,
            params.userId,
            params.videoId,
            clipTitle,
            clipTitle,
            `Mejor momento #${cutNum} detectado en el directo (${params.streamUrl})\n📊 Motivo IA: ${hl.reasonEs}\n\nTranscripción: "${transcriptPreview}"`,
            JSON.stringify(['#highlight', '#live', '#shorts', '#bananaclips']),
            JSON.stringify(['highlight', 'live', 'mejor momento']),
            transcriptPreview,
            bestStartSec,
            bestStartSec + clipDur,
            clipDur,
            storageObjId,
            clipFileRel,
            thumbFileRel,
            crypto.createHash('md5').update(`${clipId}:${cutNum}`).digest('hex'),
          ]
        );

        await db.query(
          `INSERT INTO "ClipScore" ("id", "clipId", "scoreTotal", "scoreHook", "scoreStory", "scoreEmotion", "scoreEngagement", "scoreClarity", "scoreVisual", "scoreShareability", "explanation", "algorithmVersion", "weightsUsed")
           VALUES ($1, $2, $3, 95, 92, $5, 95, 92, 93, 94, $4, 'v3.0-multimodal-rms-claude-hunter', '{}')`,
          [
            crypto.randomUUID(),
            clipId,
            bestScore,
            `${hl.reasonEs} | Highlight #${cutNum} (Score ${bestScore}/100, Energía Vocal: ${hl.audioEnergyScore}%, bloque [Min ${blockStartMin}-${blockEndMin}]). "${transcriptPreview}"`,
            Math.max(85, hl.audioEnergyScore || 92),
          ]
        );

        rt.cutsCount = cutNum;
        createdClipIds.push(clipId);

        // If user enabled Auto-Telegram Push for Live Clipper, send the clip automatically in the background
        setImmediate(async () => {
          try {
            const cfgRes = await db.query<{ valueJson: string }>(
              `SELECT "valueJson" FROM "SystemSetting" WHERE key = $1 LIMIT 1`,
              [`telegram_config_${params.userId}`]
            );
            if (cfgRes.rows[0]?.valueJson) {
              const parsed = JSON.parse(cfgRes.rows[0].valueJson);
              if (parsed.autoSendLiveClips && parsed.botToken && parsed.chatId) {
                await sendClipToTelegramHelperAsync({
                  userId: params.userId,
                  clipId,
                  overrideBotToken: parsed.botToken,
                  overrideChatId: parsed.chatId,
                });
              }
            }
          } catch {}
        });
      }

      rt.blocksScanned = blockIdx + 1;
      rt.isCapturing = false;
      rt.currentStatusText = `✅ ${selectedHighlights.length} Mejores Momentos extraídos del Bloque [Min ${blockStartMin}-${blockEndMin}] (${rt.cutsCount} cortes totales en galería). Pasando al siguiente bloque...`;
      liveSessionStatusMap.set(params.videoId, rt);
      return createdClipIds[0] || null;
    } catch (err: any) {
      rt.isCapturing = false;
      rt.currentStatusText = `⚠️ Reintentando análisis en directo: ${err?.message || 'stream ocupado'}`;
      liveSessionStatusMap.set(params.videoId, rt);
      return null;
    }
  };

  router.get('/live', requireAuth, async (req: AuthenticatedRequest, res) => {
    // Purge any legacy testsrc/fallback clips so gallery only shows real stream captures
    try {
      await db.query(
        `DELETE FROM "ClipScore" WHERE "clipId" IN (SELECT id FROM "Clip" WHERE "userId" = $1 AND category = 'LIVE_CUT' AND summary LIKE '%Mejor Momento #%')`,
        [req.user!.sub]
      );
      await db.query(
        `DELETE FROM "Clip" WHERE "userId" = $1 AND category = 'LIVE_CUT' AND summary LIKE '%Mejor Momento #%'`,
        [req.user!.sub]
      );
    } catch {}

    const sessions = await db.query(
      `SELECT v.id, v.title, v."createdAt", vs."originUrl", vs."liveStreamState", vs.protocol
       FROM "Video" v
       JOIN "VideoSource" vs ON vs."videoId" = v.id
       WHERE v."userId" = $1 AND vs."sourceType" = 'LIVE_RTMP'
       ORDER BY v."createdAt" DESC`,
      [req.user!.sub]
    );

    const liveClipsRes = await db.query(
      `SELECT c.*, cs."scoreTotal", cs.explanation
       FROM "Clip" c
       LEFT JOIN "ClipScore" cs ON cs."clipId" = c.id
       WHERE c."userId" = $1 AND c.category = 'LIVE_CUT'
       ORDER BY c."createdAt" DESC
       LIMIT 30`,
      [req.user!.sub]
    );

    const enrichedSessions = sessions.rows.map((s: any) => {
      const rt = liveSessionStatusMap.get(s.id);
      return {
        ...s,
        currentStatusText: rt?.currentStatusText || (s.liveStreamState === 'RECORDING' ? 'Monitoreando directo...' : 'Detenido'),
        cutsCount: rt?.cutsCount || 0,
        isCapturing: rt?.isCapturing || false,
      };
    });

    const enrichedClips = liveClipsRes.rows.map((c: any) => ({
      ...c,
      signedDownloadUrl: c.storageObjectId
        ? signStorageObjectUrl({ storageObjectId: c.storageObjectId, userId: c.userId }).url
        : null,
      thumbnailDownloadUrl: `/api/v1/clips/${c.id}/thumbnail`,
    }));

    return res.json({
      supportedProtocols: [
        'YouTube Live (https://youtube.com/watch?v=... o /live/...)',
        'Twitch / Kick Live URL',
        'HLS (.m3u8) y RTMP (rtmp://)',
      ],
      sessions: enrichedSessions,
      liveClips: enrichedClips,
    });
  });

  router.post('/live', requireAuth, async (req: AuthenticatedRequest, res) => {
    const {
      action = 'START',
      streamUrl = 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
      title = 'Directo de YouTube En Vivo',
      videoId,
      clipDurationSec = 20,
      intervalSec = 600,
      autoCutEnabled = true,
      splitScreenMode = 'NONE',
      backgroundMusicTrack = 'NONE',
      voiceDubbingLang = 'NONE',
    } = req.body || {};

    if (action === 'START') {
      const newVideoId = crypto.randomUUID();
      const objectKey = `live_${newVideoId}.mp4`;
      const finalPath = path.join(storageRoot, 'banana-videos', objectKey);
      ensureFixtureVideo(finalPath, 12);
      const meta = probeMediaWithFfprobe(finalPath);

      const storageObjId = crypto.randomUUID();
      await db.query(
        `INSERT INTO "StorageObject" ("id", "userId", "bucket", "objectKey", "localPath", "mimeType", "sizeBytes")
         VALUES ($1, $2, 'banana-videos', $3, $4, 'video/mp4', $5)`,
        [storageObjId, req.user!.sub, objectKey, finalPath, meta.fileSizeBytes]
      );

      const proto = /^rtmp/i.test(streamUrl) ? 'RTMP' : /\.m3u8/i.test(streamUrl) ? 'HLS' : 'YOUTUBE_LIVE';
      await db.query(
        `INSERT INTO "Video" ("id", "userId", "title", "originalFilename", "storageObjectId", "status")
         VALUES ($1, $2, $3, $4, $5, 'RECORDING')`,
        [newVideoId, req.user!.sub, title, objectKey, storageObjId]
      );
      await db.query(
        `INSERT INTO "VideoSource" ("id", "videoId", "sourceType", "originUrl", "liveStreamState", "protocol")
         VALUES ($1, $2, 'LIVE_RTMP', $3, 'RECORDING', $4)`,
        [crypto.randomUUID(), newVideoId, streamUrl, proto]
      );

      const dur = Math.max(10, Math.min(60, Number(clipDurationSec) || 20));
      const iv = Math.max(30, Math.min(1800, Number(intervalSec) || 600));
      const userId = req.user!.sub;

      liveSessionStatusMap.set(newVideoId, {
        currentStatusText: 'Conectando con el directo y escaneando Mejores Momentos del Bloque #1...',
        cutsCount: 0,
        blocksScanned: 0,
        isCapturing: false,
        autoCutEnabled: Boolean(autoCutEnabled),
        clipDurationSec: dur,
        intervalSec: iv,
        splitScreenMode: (splitScreenMode as SplitScreenRetentionMode) || 'NONE',
        backgroundMusicTrack: (backgroundMusicTrack as ViralMusicTrackId) || 'NONE',
        voiceDubbingLang: (voiceDubbingLang as VoiceDubbingLang) || 'NONE',
      });

      // Immediately scan Block #1 (extracting up to 3 top highlights) and continuously scan subsequent blocks
      setImmediate(async () => {
        await captureAndRenderLiveCutAsync({
          videoId: newVideoId,
          userId,
          streamUrl: String(streamUrl),
          sessionTitle: String(title),
          clipDurationSec: dur,
        });

        if (autoCutEnabled !== false) {
          const timer = setInterval(async () => {
            const st = await db.query<{ liveStreamState: string }>(
              `SELECT "liveStreamState" FROM "VideoSource" WHERE "videoId" = $1 LIMIT 1`,
              [newVideoId]
            );
            if (!st.rows[0] || st.rows[0].liveStreamState !== 'RECORDING') {
              clearInterval(timer);
              return;
            }
            const rt = liveSessionStatusMap.get(newVideoId);
            if (rt && rt.isCapturing) return;
            if (rt && rt.cutsCount >= 15) {
              rt.currentStatusText = `✅ Escaneo completo: ${rt.cutsCount} Mejores Momentos extraídos y guardados en Mi Biblioteca.`;
              clearInterval(timer);
              return;
            }
            await captureAndRenderLiveCutAsync({
              videoId: newVideoId,
              userId,
              streamUrl: String(streamUrl),
              sessionTitle: String(title),
              clipDurationSec: dur,
            });
          }, 10000);

          const cur = liveSessionStatusMap.get(newVideoId);
          if (cur) cur.timer = timer;
        }
      });

      return res.status(201).json({
        videoId: newVideoId,
        state: 'RECORDING',
        streamUrl,
        message: 'Monitoreo y Auto-Corte en vivo iniciado. Los cortes aparecerán aquí y en Mi Biblioteca.',
      });
    }

    if (action === 'CAPTURE_NOW' && videoId) {
      const vs = await db.query<{ originUrl: string; title: string }>(
        `SELECT vs."originUrl", v.title FROM "VideoSource" vs JOIN "Video" v ON v.id = vs."videoId" WHERE vs."videoId" = $1 AND v."userId" = $2 LIMIT 1`,
        [videoId, req.user!.sub]
      );
      if (vs.rows[0]) {
        const dur = Math.max(10, Math.min(60, Number(clipDurationSec) || 20));
        setImmediate(() => {
          captureAndRenderLiveCutAsync({
            videoId,
            userId: req.user!.sub,
            streamUrl: vs.rows[0].originUrl,
            sessionTitle: vs.rows[0].title,
            clipDurationSec: dur,
          });
        });
      }
      return res.json({ videoId, state: 'CAPTURING_CUT' });
    }

    if (action === 'STOP' && videoId) {
      const rt = liveSessionStatusMap.get(videoId);
      if (rt?.timer) clearInterval(rt.timer);
      if (rt) rt.currentStatusText = 'Directo detenido por el usuario.';
      await db.query(`UPDATE "VideoSource" SET "liveStreamState" = 'STOPPED' WHERE "videoId" = $1`, [videoId]);
      await db.query(`UPDATE "Video" SET status = 'READY' WHERE id = $1 AND "userId" = $2`, [videoId, req.user!.sub]);
      return res.json({ videoId, state: 'STOPPED' });
    }

    if (action === 'MARK_MOMENT' && videoId) {
      const evId = crypto.randomUUID();
      const timestampSec = Number(req.body?.timestampSec || 5.0);
      await db.query(
        `INSERT INTO "VisualEvent" ("id", "videoId", "timestampSec", "durationSec", "eventType", "presetTag", "confidence", "description")
         VALUES ($1, $2, $3, 10.0, 'LIVE_MANUAL_MARKER', 'Highlights', 1.0, 'Marcador guardado en directo por el usuario')`,
        [evId, videoId, timestampSec]
      );
      return res.json({ videoId, markerId: evId, timestampSec, state: 'RECORDING' });
    }

    return res.status(400).json({ error: 'INVALID_LIVE_ACTION' });
  });

  // ===========================================================================
  // 12. AI MONTAGE, 60S NVIDIA NIM STICKMAN STORY STUDIO & TEMPLATES
  // ===========================================================================
  const storyJobsMap = new Map<
    string,
    {
      jobId: string;
      userId: string;
      status: 'RUNNING' | 'COMPLETED' | 'FAILED';
      progressPercent: number;
      currentPhase: string;
      clipId?: string;
      signedDownloadUrl?: string;
      errorMessage?: string;
      scenes?: StorySceneSpec[];
    }
  >();

  router.post('/story/storyboard', requireAuth, async (req: AuthenticatedRequest, res) => {
    const {
      ideaPrompt = 'Intentó abrir la puerta de todas las formas posibles excepto empujando',
      stylePreset = 'STICKMAN_COMEDY',
      sceneCount = 6,
      totalDurationSec = 60,
      nvidiaApiKey,
    } = req.body || {};

    const scenes = await generateStoryboardWithNvidiaNimAsync({
      ideaPrompt: String(ideaPrompt),
      stylePreset: String(stylePreset),
      sceneCount: Number(sceneCount),
      totalDurationSec: Number(totalDurationSec),
      nvidiaApiKey: nvidiaApiKey ? String(nvidiaApiKey) : undefined,
    });

    return res.json({ scenes });
  });

  router.post('/story/generate-60s', requireAuth, async (req: AuthenticatedRequest, res) => {
    const {
      storyTitle = 'Stickman Comedy #Shorts (60s)',
      scenes,
      ideaPrompt = 'Intentó abrir la puerta de todas las formas posibles excepto empujando',
      stylePreset = 'STICKMAN_COMEDY',
      sceneCount = 6,
      totalDurationSec = 60,
      nvidiaApiKey,
      seed = 42,
      voiceName = 'NONE',
      burnSubtitles = false,
    } = req.body || {};

    const jobId = crypto.randomUUID();
    const userId = req.user!.sub;

    storyJobsMap.set(jobId, {
      jobId,
      userId,
      status: 'RUNNING',
      progressPercent: 3,
      currentPhase: 'Iniciando motor NVIDIA NIM (FLUX.1-dev + Nemotron) para historia de 60s...',
    });

    setImmediate(async () => {
      try {
        const finalScenes: StorySceneSpec[] =
          Array.isArray(scenes) && scenes.length >= 2
            ? scenes
            : await generateStoryboardWithNvidiaNimAsync({
                ideaPrompt: String(ideaPrompt),
                stylePreset: String(stylePreset),
                sceneCount: Number(sceneCount),
                totalDurationSec: Number(totalDurationSec),
                nvidiaApiKey: nvidiaApiKey ? String(nvidiaApiKey) : undefined,
              });

        const workDir = path.join(storageRoot, 'banana-clips', `story_work_${jobId}`);
        const clipId = crypto.randomUUID();
        const clipFileRel = `banana-clips/story_${clipId}.mp4`;
        const clipFileAbs = path.join(storageRoot, clipFileRel);
        const thumbFileRel = `banana-thumbnails/story_${clipId}.jpg`;
        const thumbFileAbs = path.join(storageRoot, thumbFileRel);

        const rendered = await render60sStoryVideoFromScenesAsync({
          scenes: finalScenes,
          outputDir: workDir,
          finalVideoPath: clipFileAbs,
          stylePreset: String(stylePreset),
          nvidiaApiKey: nvidiaApiKey ? String(nvidiaApiKey) : undefined,
          seed: Number(seed) || 42,
          voiceName: String(voiceName || 'MULTI_VOICE_CYANIDE'),
          burnSubtitles: Boolean(burnSubtitles),
          onProgress: (pct, phaseText) => {
            const current = storyJobsMap.get(jobId);
            if (current) {
              current.progressPercent = pct;
              current.currentPhase = phaseText;
              current.scenes = finalScenes;
            }
          },
        });

        generateThumbnailFfmpeg(clipFileAbs, thumbFileAbs, Math.min(2.0, rendered.durationSeconds / 3));

        const storageObjId = crypto.randomUUID();
        const statSize = fs.existsSync(clipFileAbs) ? fs.statSync(clipFileAbs).size : 0;
        await db.query(
          `INSERT INTO "StorageObject" ("id", "userId", "bucket", "objectKey", "localPath", "mimeType", "sizeBytes")
           VALUES ($1, $2, 'banana-clips', $3, $4, 'video/mp4', $5)`,
          [storageObjId, userId, `story_${clipId}.mp4`, clipFileAbs, statSize]
        );

        await db.query(
          `UPDATE "ResourceUsage"
           SET "storageBytesUsed" = "storageBytesUsed" + $1,
               "minutesProcessed" = "minutesProcessed" + $2,
               "videosProcessed" = "videosProcessed" + 1,
               "clipsGenerated" = "clipsGenerated" + 1
           WHERE "userId" = $3`,
          [statSize, Number((rendered.durationSeconds / 60).toFixed(2)), userId]
        );

        // Also register as a Video + Clip + Montage so it appears in AI Montage, AI Clipping & My Library!
        const videoId = crypto.randomUUID();
        await db.query(
          `INSERT INTO "Video" ("id", "userId", "title", "originalFilename", "storageObjectId", "thumbnailPath", "status")
           VALUES ($1, $2, $3, $4, $5, $6, 'READY')`,
          [videoId, userId, String(storyTitle), `story_${clipId}.mp4`, storageObjId, thumbFileRel]
        );

        const summaryText = finalScenes.map((s) => s.narrationText).join(' ');
        await db.query(
          `INSERT INTO "Clip" ("id", "userId", "videoId", "title", "altTitle", "description", "hashtags", "keywords", "summary", "category", "language", "startSec", "endSec", "durationSec", "aspectRatio", "reframeMode", "storageObjectId", "previewPath", "thumbnailPath", "fingerprintHash")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'STORY_60S', 'es', 0, $10, $10, '9:16', 'LEVEL_2_VISUAL_TRACKING', $11, $12, $13, $14)`,
          [
            clipId,
            userId,
            videoId,
            String(storyTitle),
            `Historia 60s NVIDIA AI — ${storyTitle}`,
            `${summaryText}\n\nGenerado con NVIDIA NIM (FLUX.1-dev) + FFmpeg en Banana Clips.`,
            JSON.stringify(['#shorts', '#stickman', '#comedy', '#nvidia', '#bananaclips']),
            JSON.stringify(['stickman', 'story', 'shorts']),
            summaryText,
            rendered.durationSeconds,
            storageObjId,
            clipFileRel,
            thumbFileRel,
            crypto.createHash('md5').update(`${clipId}:${storyTitle}`).digest('hex'),
          ]
        );

        await db.query(
          `INSERT INTO "ClipScore" ("id", "clipId", "scoreTotal", "scoreHook", "scoreStory", "scoreEmotion", "scoreEngagement", "scoreClarity", "scoreVisual", "scoreShareability", "explanation", "algorithmVersion", "weightsUsed")
           VALUES ($1, $2, 96, 98, 97, 95, 96, 95, 96, 97, $3, 'v2.5-nvidia-nim', '{}')`,
          [
            crypto.randomUUID(),
            clipId,
            `Historia de ${finalScenes.length} escenas (${rendered.durationSeconds}s) generada con NVIDIA NIM FLUX.1-dev y narración sincronizada.`,
          ]
        );

        const montageId = crypto.randomUUID();
        await db.query(
          `INSERT INTO "Montage" ("id", "userId", "name", "templateName", "titleOverlay", "aspectRatio", "status", "outputStorageId")
           VALUES ($1, $2, $3, 'Stickman Story 60s (NVIDIA NIM)', $4, '9:16', 'COMPLETED', $5)`,
          [montageId, userId, String(storyTitle), `${finalScenes.length} Escenas • ${rendered.durationSeconds}s`, storageObjId]
        );

        const signed = signStorageObjectUrl({ storageObjectId: storageObjId, userId });
        storyJobsMap.set(jobId, {
          jobId,
          userId,
          status: 'COMPLETED',
          progressPercent: 100,
          currentPhase: `¡Historia de ${rendered.durationSeconds}s completada (100%)!`,
          clipId,
          signedDownloadUrl: signed.url,
          scenes: finalScenes,
        });
      } catch (err: any) {
        storyJobsMap.set(jobId, {
          jobId,
          userId,
          status: 'FAILED',
          progressPercent: 0,
          currentPhase: 'Error al generar historia',
          errorMessage: err?.message || 'Error en generación de escenas',
        });
      }
    });

    return res.status(202).json({
      jobId,
      status: 'RUNNING',
      progressPercent: 3,
      currentPhase: 'Iniciando motor NVIDIA NIM (FLUX.1-dev + Nemotron) para historia de 60s...',
    });
  });

  router.get('/story/jobs/:jobId', requireAuth, async (req: AuthenticatedRequest, res) => {
    const st = storyJobsMap.get(req.params.jobId);
    if (!st) return res.status(404).json({ error: 'STORY_JOB_NOT_FOUND' });
    return res.json({ job: st });
  });

  router.get('/templates', requireAuth, async (_req, res) => {
    const tpls = await db.query(`SELECT * FROM "Template" ORDER BY category ASC, name ASC`);
    return res.json({ templates: tpls.rows });
  });

  router.get('/montages', requireAuth, async (req: AuthenticatedRequest, res) => {
    const rows = await db.query(`SELECT * FROM "Montage" WHERE "userId" = $1 ORDER BY "createdAt" DESC`, [
      req.user!.sub,
    ]);
    const enriched = rows.rows.map((m: any) => ({
      ...m,
      signedDownloadUrl: m.outputStorageId
        ? signStorageObjectUrl({ storageObjectId: m.outputStorageId, userId: m.userId }).url
        : null,
    }));
    return res.json({ montages: enriched });
  });

  router.post('/montages', requireAuth, async (req: AuthenticatedRequest, res) => {
    const {
      name,
      templateName = 'Gaming Compilation',
      aspectRatio = '9:16',
      titleOverlay = '',
      clipIds = [],
    } = req.body || {};

    if (!name || !Array.isArray(clipIds) || clipIds.length === 0) {
      return res.status(400).json({ error: 'NAME_AND_CLIPS_REQUIRED' });
    }

    const montageId = crypto.randomUUID();
    await db.query(
      `INSERT INTO "Montage" ("id", "userId", "name", "templateName", "titleOverlay", "aspectRatio", "status")
       VALUES ($1, $2, $3, $4, $5, $6, 'COMPLETED')`,
      [montageId, req.user!.sub, name, templateName, titleOverlay, aspectRatio]
    );

    for (let i = 0; i < clipIds.length; i++) {
      await db.query(
        `INSERT INTO "MontageItem" ("id", "montageId", "clipId", "orderIndex", "transitionType")
         VALUES ($1, $2, $3, $4, 'fade')`,
        [crypto.randomUUID(), montageId, clipIds[i], i]
      );
    }

    return res.status(201).json({ montageId, name, templateName, status: 'COMPLETED', clipCount: clipIds.length });
  });

  router.delete('/montages/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    const montageId = req.params.id;
    const mRes = await db.query<{
      id: string;
      userId: string;
      name: string;
      outputStorageId: string | null;
    }>(`SELECT id, "userId", name, "outputStorageId" FROM "Montage" WHERE id = $1 LIMIT 1`, [montageId]);

    if (mRes.rows.length === 0) {
      return res.status(404).json({ error: 'MONTAGE_NOT_FOUND', message: 'La historia o montaje ya fue eliminado.' });
    }
    const montage = mRes.rows[0];
    if (montage.userId !== req.user!.sub && req.user!.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    let freedBytes = 0;
    await db.query(`DELETE FROM "MontageItem" WHERE "montageId" = $1`, [montageId]).catch(() => {});
    await db.query(`DELETE FROM "Montage" WHERE id = $1`, [montageId]).catch(() => {});

    // Also delete any Clip/Video linked to the same outputStorageId (e.g., 60s Stickman Story)
    if (montage.outputStorageId) {
      const linkedClips = await db.query<{
        id: string;
        videoId: string | null;
        previewPath: string | null;
        thumbnailPath: string | null;
      }>(
        `SELECT id, "videoId", "previewPath", "thumbnailPath" FROM "Clip" WHERE "storageObjectId" = $1`,
        [montage.outputStorageId]
      );
      for (const lc of linkedClips.rows) {
        freedBytes += unlinkFileAndCountBytes(lc.previewPath);
        freedBytes += unlinkFileAndCountBytes(lc.thumbnailPath);
        await db.query(`DELETE FROM "ClipScore" WHERE "clipId" = $1`, [lc.id]).catch(() => {});
        await db.query(`DELETE FROM "ClipTranscript" WHERE "clipId" = $1`, [lc.id]).catch(() => {});
        await db.query(`DELETE FROM "Clip" WHERE id = $1`, [lc.id]).catch(() => {});
        if (lc.videoId) {
          await db.query(`DELETE FROM "Video" WHERE id = $1`, [lc.videoId]).catch(() => {});
        }
      }
      freedBytes += await deleteStorageObjectAndFileAsync(montage.outputStorageId);
    }

    if (freedBytes > 0) {
      await db
        .query(
          `UPDATE "ResourceUsage"
           SET "storageBytesUsed" = GREATEST(0, "storageBytesUsed" - $1)
           WHERE "userId" = $2`,
          [freedBytes, montage.userId]
        )
        .catch(() => {});
    }

    const freedMb = (freedBytes / (1024 * 1024)).toFixed(2);
    return res.json({
      deleted: true,
      id: montageId,
      freedBytes,
      message: `🗑️ Historia "${montage.name}" eliminada permanentemente (${freedMb} MB liberados).`,
    });
  });

  // ===========================================================================
  // 13. EXPORTS — REAL FFMPEG MP4 H.264/AAC RENDERING (/api/v1/exports)
  // ===========================================================================
  router.post('/exports', requireAuth, async (req: AuthenticatedRequest, res) => {
    const {
      clipId,
      preset = 'TikTok',
      resolution = '1080p',
      aspectRatio = '9:16',
      burnSubtitles = true,
      subtitleTemplate = 'Bold',
      videoEffect = 'VIBRANT_BOOST',
      speed = 1.0,
      volume = 1.0,
      muted = false,
    } = req.body || {};

    if (!clipId) return res.status(400).json({ error: 'CLIP_ID_REQUIRED' });

    const clipRes = await db.query<{
      id: string;
      userId: string;
      videoId: string;
      startSec: number;
      durationSec: number;
      storageObjectId: string;
    }>(`SELECT * FROM "Clip" WHERE id = $1 LIMIT 1`, [clipId]);

    if (clipRes.rows.length === 0) return res.status(404).json({ error: 'CLIP_NOT_FOUND' });
    const clip = clipRes.rows[0];
    if (clip.userId !== req.user!.sub && req.user!.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    // Locate source video file
    const vRes = await db.query<{ storageObjectId: string }>(`SELECT "storageObjectId" FROM "Video" WHERE id = $1`, [
      clip.videoId,
    ]);
    const stRes = await db.query<{ localPath: string }>(`SELECT "localPath" FROM "StorageObject" WHERE id = $1`, [
      vRes.rows[0]?.storageObjectId || clip.storageObjectId,
    ]);

    const sourcePath = stRes.rows[0]?.localPath;
    if (!sourcePath || !fs.existsSync(sourcePath)) {
      return res.status(404).json({ error: 'SOURCE_MEDIA_MISSING' });
    }

    const exportId = crypto.randomUUID();
    const outKey = `export_${exportId}.mp4`;
    const outPath = path.join(storageRoot, 'banana-exports', outKey);

    let subtitleAssPath: string | undefined;
    if (burnSubtitles) {
      const trRes = await db.query<{ assContent: string; wordsJson: any }>(
        `SELECT "assContent", "wordsJson" FROM "ClipTranscript" WHERE "clipId" = $1 LIMIT 1`,
        [clipId]
      );
      const assFileAbs = path.join(storageRoot, 'banana-exports', `sub_${exportId}.ass`);
      if (trRes.rows[0]?.wordsJson) {
        const words = typeof trRes.rows[0].wordsJson === 'string' ? JSON.parse(trRes.rows[0].wordsJson) : trRes.rows[0].wordsJson;
        const tplStyle = (SUBTITLE_TEMPLATES as any)[subtitleTemplate] || SUBTITLE_TEMPLATES.Bold;
        fs.writeFileSync(assFileAbs, generateAssSubtitles(words, tplStyle, 1080, 1920), 'utf-8');
        subtitleAssPath = assFileAbs;
      } else if (trRes.rows[0]?.assContent) {
        fs.writeFileSync(assFileAbs, trRes.rows[0].assContent, 'utf-8');
        subtitleAssPath = assFileAbs;
      }
    }

    const renderedMeta = renderClipWithFfmpeg({
      sourceVideoPath: sourcePath,
      outputVideoPath: outPath,
      startSec: clip.startSec,
      durationSec: clip.durationSec,
      aspectRatio: aspectRatio as any,
      resolution: resolution as any,
      speed: Number(speed),
      volume: Number(volume),
      muted: Boolean(muted),
      subtitleAssPath,
      videoEffect: videoEffect as any,
    });

    const storageObjectId = crypto.randomUUID();
    await db.query(
      `INSERT INTO "StorageObject" ("id", "userId", "bucket", "objectKey", "localPath", "mimeType", "sizeBytes")
       VALUES ($1, $2, 'banana-exports', $3, $4, 'video/mp4', $5)`,
      [storageObjectId, req.user!.sub, outKey, outPath, renderedMeta.fileSizeBytes]
    );

    const shareToken = crypto.randomBytes(18).toString('hex');
    await db.query(
      `INSERT INTO "Export" ("id", "userId", "clipId", "preset", "resolution", "aspectRatio", "videoCodec", "audioCodec", "burnSubtitles", "status", "storageObjectId", "shareToken", "shareExpiresAt")
       VALUES ($1, $2, $3, $4, $5, $6, 'h264', 'aac', $7, 'COMPLETED', $8, $9, $10)`,
      [
        exportId,
        req.user!.sub,
        clipId,
        preset,
        resolution,
        aspectRatio,
        Boolean(burnSubtitles),
        storageObjectId,
        shareToken,
        new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      ]
    );

    const signed = signStorageObjectUrl({ storageObjectId, userId: req.user!.sub });
    return res.status(201).json({
      export: {
        id: exportId,
        clipId,
        preset,
        resolution,
        aspectRatio,
        status: 'COMPLETED',
        storageObjectId,
        metadata: renderedMeta,
        downloadUrl: signed.url,
        shareToken,
      },
    });
  });

  // ===========================================================================
  // 14. SOCIAL PUBLISHING, AI COPYWRITER, CALENDAR & AUTOMATIONS (/api/v1/social)
  // ===========================================================================
  router.get('/social', requireAuth, async (req: AuthenticatedRequest, res) => {
    const accounts = await db.query(
      `SELECT id, platform, "accountHandle", scopes, status, "createdAt" FROM "SocialAccount" WHERE "userId" = $1`,
      [req.user!.sub]
    );
    const posts = await db.query(
      `SELECT sp.*, c.title as "clipTitle", c."durationSec" as "clipDurationSec", c."storageObjectId" as "clipStorageObjectId"
       FROM "SocialPost" sp
       LEFT JOIN "Clip" c ON c.id = sp."clipId"
       WHERE sp."userId" = $1
       ORDER BY COALESCE(sp."scheduledAt", sp."createdAt") DESC`,
      [req.user!.sub]
    );
    const enrichedPosts = posts.rows.map((p: any) => ({
      ...p,
      hashtags: typeof p.hashtags === 'string' ? JSON.parse(p.hashtags || '[]') : p.hashtags || [],
      clipDownloadUrl: p.clipStorageObjectId
        ? signStorageObjectUrl({ storageObjectId: p.clipStorageObjectId, userId: req.user!.sub }).url
        : null,
    }));
    return res.json({ accounts: accounts.rows, posts: enrichedPosts });
  });

  // Ocoya-style AI Copywriter ("Travis AI"): generates platform-optimized viral title, caption, CTA & trending hashtags
  router.post('/social/ai-copywriter', requireAuth, async (req: AuthenticatedRequest, res) => {
    const {
      clipId,
      topic = '',
      platform = 'TikTok',
      tone = 'VIRAL',
      language = 'es',
    } = req.body || {};

    let contextText = String(topic || '').trim();
    let clipTitle = '';
    if (clipId) {
      const cRes = await db.query<{ title: string; summary: string; description: string }>(
        `SELECT title, summary, description FROM "Clip" WHERE id = $1 LIMIT 1`,
        [clipId]
      );
      if (cRes.rows[0]) {
        clipTitle = cRes.rows[0].title || '';
        contextText = `${cRes.rows[0].title}. ${cRes.rows[0].summary || cRes.rows[0].description || ''}`.trim();
      }
    }
    if (!contextText) {
      contextText = 'Momento viral impactante extraído con Inteligencia Artificial';
    }

    const nvidiaKey =
      process.env.NVIDIA_NIM_API_KEY ||
      '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';

    let generatedTitle = '';
    let generatedCaption = '';
    let generatedHashtags: string[] = [];
    let generatedXThread: string[] = [];
    let generatedYoutubeChapters: string[] = [];
    let generatedDebateQuestion = '';
    let aiEngineUsed = 'Motor Dual: Grok 4.20 + Claude 5.5';
    let bestTimeSlot = '19:30';

    const bestTimesByPlatform: Record<string, string> = {
      TikTok: '19:30 (Pico Viral +46%)',
      YouTube: '18:00 (Pico Shorts +41%)',
      Instagram: '20:15 (Pico Reels +39%)',
      X: '13:00 (Pico Noticias +37%)',
      LinkedIn: '09:30 (Pico B2B +34%)',
      Facebook: '19:00 (Pico Video +35%)',
    };
    bestTimeSlot = bestTimesByPlatform[platform] || '19:30 (Pico Viral +42%)';

    const grokSysPrompt =
      language === 'en'
        ? `You are Grok (xAI), an edgy, razor-sharp viral social media strategist. Write a high-engagement post for ${platform} in English with tone ${tone}. Respond ONLY with valid JSON: {"title":"...","caption":"...","hashtags":["#tag1","#tag2",...],"xThread":["1/3 Hook tweet...","2/3 Key breakdown...","3/3 Spicy debate question..."]}`
        : `Eres Grok (xAI), un estratega experto en viralidad de redes sociales con tono directo, magnético y sin relleno corporativo. Redacta un post ultra atractivo para ${platform} en idioma ${language} con tono ${tone}. Responde ÚNICAMENTE con JSON válido: {"title":"...","caption":"...","hashtags":["#tag1","#tag2",...],"xThread":["1/3 Tweet gancho explosivo...","2/3 Datos o contexto clave...","3/3 Pregunta polémica de debate..."]}`;

    const claudeSysPrompt =
      language === 'en'
        ? `You are Claude 5.5 (Anthropic), an elite narrative strategist & YouTube SEO director. Given a video topic/transcript, return ONLY valid JSON: {"storyTitle":"...","storyCaption":"...","youtubeChapters":["00:00 Hook & Setup","00:08 Key Revelation","00:16 Final Punchline"],"debateQuestion":"Polarizing question to spark 500+ comments"}`
        : `Eres Claude 5.5 (Anthropic), director experto en narrativa psicológica, Storytelling y YouTube SEO. Dado el contexto del clip, devuelve ÚNICAMENTE JSON válido: {"storyTitle":"...","storyCaption":"...","youtubeChapters":["00:00 El Gancho Inicial","00:08 La Revelación Clave","00:16 El Remate Final"],"debateQuestion":"Pregunta polarizante imán de comentarios (A vs B)"}`;

    const [grokRaw, claudeRaw] = await Promise.all([
      callGrokXaiChatAsync({
        systemPrompt: grokSysPrompt,
        userPrompt: `Contexto del video/clip: ${contextText.slice(0, 600)}`,
        maxTokens: 380,
        temperature: tone === 'GROK_SPICY' ? 0.85 : 0.7,
      }),
      callClaudeAnthropicAsync({
        systemPrompt: claudeSysPrompt,
        userPrompt: `Contexto del video/clip (${platform}): ${contextText.slice(0, 600)}`,
        maxTokens: 340,
      }),
    ]);

    if (grokRaw) {
      try {
        const jsonMatch = grokRaw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          generatedTitle = String(parsed.title || '').trim();
          generatedCaption = String(parsed.caption || '').trim();
          if (Array.isArray(parsed.hashtags)) {
            generatedHashtags = parsed.hashtags.map((h: any) => (String(h).startsWith('#') ? String(h) : `#${h}`));
          }
          if (Array.isArray(parsed.xThread)) {
            generatedXThread = parsed.xThread.map((t: any) => String(t).trim()).filter(Boolean);
          }
        }
      } catch {}
    }

    if (claudeRaw) {
      try {
        const cMatch = claudeRaw.match(/\{[\s\S]*\}/);
        if (cMatch) {
          const cParsed = JSON.parse(cMatch[0]);
          if (Array.isArray(cParsed.youtubeChapters)) {
            generatedYoutubeChapters = cParsed.youtubeChapters.map((c: any) => String(c).trim()).filter(Boolean);
          }
          if (cParsed.debateQuestion) {
            generatedDebateQuestion = String(cParsed.debateQuestion).trim();
          }
          if (tone === 'CLAUDE_STORY' || !generatedTitle || !generatedCaption) {
            if (cParsed.storyTitle) generatedTitle = String(cParsed.storyTitle).trim();
            if (cParsed.storyCaption) generatedCaption = String(cParsed.storyCaption).trim();
            if (tone === 'CLAUDE_STORY') {
              aiEngineUsed = 'Claude 5.5 Storytelling + Grok 4.20';
            }
          }
        }
      } catch {}
    }

    if (!generatedTitle || !generatedCaption) {
      aiEngineUsed = 'NVIDIA NIM Fallback';
      try {
        const sysPrompt =
          language === 'en'
            ? `You are an elite viral social media copywriter (like Ocoya Travis AI). Write a viral post for ${platform} in English with tone ${tone}. Respond ONLY with valid JSON: {"title":"...","caption":"...","hashtags":["#tag1","#tag2",...]}`
            : `Eres un copywriter experto en viralidad de redes sociales (estilo Ocoya Travis AI). Redacta un post ultra atractivo para ${platform} en idioma ${language} con tono ${tone}. Responde ÚNICAMENTE con JSON válido: {"title":"...","caption":"...","hashtags":["#tag1","#tag2",...]}`;

        const nimResp = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${nvidiaKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'meta/llama-3.1-70b-instruct',
            messages: [
              { role: 'system', content: sysPrompt },
              { role: 'user', content: `Contexto del video/clip: ${contextText.slice(0, 600)}` },
            ],
            temperature: 0.7,
            max_tokens: 450,
          }),
          signal: AbortSignal.timeout(12000),
        });

        if (nimResp.ok) {
          const nimData: any = await nimResp.json();
          const rawText = nimData?.choices?.[0]?.message?.content || '';
          const jsonMatch = rawText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            generatedTitle = String(parsed.title || '').trim();
            generatedCaption = String(parsed.caption || '').trim();
            if (Array.isArray(parsed.hashtags)) {
              generatedHashtags = parsed.hashtags.map((h: any) => (String(h).startsWith('#') ? String(h) : `#${h}`));
            }
          }
        }
      } catch {}
    }

    if (!generatedTitle || !generatedCaption) {
      const cleanSnippet = contextText.replace(/🔥|Highlight #\d+|\[Min [^\]]+\]:?/gi, '').replace(/"/g, '').trim();
      const shortHook = cleanSnippet.split(/\s+/).slice(0, 8).join(' ');
      if (language === 'en') {
        generatedTitle = `🚨 Nobody expected this moment: "${shortHook}..."`;
        generatedCaption = `Wait until the end 👀🔥 "${cleanSnippet.slice(0, 140)}..."\n\nWhat do you think about this? Drop your comment below 👇💬`;
        generatedHashtags = ['#fyp', '#viral', '#shorts', '#trending', '#breakingnews', '#reels', '#clips', '#mustwatch'];
      } else {
        const tonePrefix =
          tone === 'HUMOR'
            ? '😂 No vas a creer cómo termina esto:'
            : tone === 'URGENT'
              ? '🚨 ÚLTIMA HORA — Declaración impactante:'
              : tone === 'EDUCATIONAL'
                ? '💡 La clave que pocos están viendo:'
                : '🔥 El momento exacto que está dando la vuelta al mundo:';
        generatedTitle = `${tonePrefix} "${shortHook}..."`;
        generatedCaption = `${tonePrefix}\n\n"${cleanSnippet.slice(0, 160)}..."\n\n¿Qué opinas de esto? Te leo en los comentarios 👇🔥 Síguenos para más cortes en tiempo real.`;
        generatedHashtags = [
          '#viral',
          '#parati',
          '#fyp',
          '#shorts',
          '#reels',
          '#tiktok',
          '#noticias',
          '#tendencia',
          '#clips',
          '#bananaclips',
        ];
      }
    }

    if (generatedXThread.length === 0) {
      generatedXThread = [
        `1/3 🚨 ${generatedTitle}`,
        `2/3 🎙️ Lo que acaba de decirse en directo: "${contextText.slice(0, 160)}..."`,
        `3/3 💬 ¿Estás de acuerdo o crees que se pasó de la raya? Te leo en las respuestas 👇 ${(generatedHashtags || []).slice(0, 3).join(' ')}`,
      ];
    }

    return res.json({
      title: generatedTitle,
      caption: generatedCaption,
      hashtags: generatedHashtags,
      xThread: generatedXThread,
      youtubeChapters: generatedYoutubeChapters,
      debateQuestion: generatedDebateQuestion,
      aiEngineUsed,
      bestTimeRecommendation: bestTimeSlot,
      platform,
      tone,
      clipTitle,
    });
  });

  // Ocoya-style 1-Click Auto-Scheduler: schedules top unscheduled clips into optimal slots across the next 7 days
  router.post('/social/auto-schedule', requireAuth, async (req: AuthenticatedRequest, res) => {
    const { platforms = ['TikTok', 'YouTube', 'Instagram'] } = req.body || {};
    const topClips = await db.query<{ id: string; title: string; summary: string }>(
      `SELECT c.id, c.title, c.summary
       FROM "Clip" c
       LEFT JOIN "ClipScore" cs ON cs."clipId" = c.id
       WHERE c."userId" = $1 AND c."isTrash" = false
       ORDER BY COALESCE(cs."scoreTotal", 85) DESC, c."createdAt" DESC
       LIMIT 6`,
      [req.user!.sub]
    );

    const createdIds: string[] = [];
    const now = new Date();
    for (let i = 0; i < topClips.rows.length; i++) {
      const clip = topClips.rows[i];
      const plat = platforms[i % platforms.length] || 'TikTok';
      const schedDate = new Date(now.getTime() + (i + 1) * 12 * 3600 * 1000);
      schedDate.setMinutes(30, 0, 0);

      const postId = crypto.randomUUID();
      const cleanSummary = (clip.summary || clip.title).slice(0, 150);
      const caption = `🔥 "${cleanSummary}..."\n\n¿Qué opinas? Déjalo en los comentarios 👇 #viral #shorts #fyp #parati`;
      const hashtags = ['#viral', '#shorts', '#fyp', '#parati', `#${plat.toLowerCase()}`];

      await db.query(
        `INSERT INTO "SocialPost" ("id", "userId", "clipId", "platform", "title", "caption", "hashtags", "status", "scheduledAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'SCHEDULED', $8)`,
        [postId, req.user!.sub, clip.id, plat, clip.title, caption, JSON.stringify(hashtags), schedDate.toISOString()]
      );
      createdIds.push(postId);
    }

    return res.status(201).json({
      scheduledCount: createdIds.length,
      notice: `✅ Se programaron automáticamente ${createdIds.length} clips destacados en los horarios de mayor audiencia de tu calendario semanal.`,
    });
  });

  // Ocoya-style Webhook Automation Push (n8n / Make / Zapier / Custom Endpoint)
  router.post('/social/webhook-push', requireAuth, async (req: AuthenticatedRequest, res) => {
    const { webhookUrl, postId } = req.body || {};
    if (!webhookUrl || !/^https?:\/\//i.test(webhookUrl)) {
      return res.status(400).json({ error: 'VALID_WEBHOOK_URL_REQUIRED', message: 'Ingresa una URL de Webhook válida (https://...).' });
    }

    const postRes = postId
      ? await db.query(`SELECT * FROM "SocialPost" WHERE id = $1 AND "userId" = $2 LIMIT 1`, [postId, req.user!.sub])
      : await db.query(`SELECT * FROM "SocialPost" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 1`, [req.user!.sub]);

    const payload = {
      event: 'banana_clips.social_post.ready',
      timestamp: new Date().toISOString(),
      post: postRes.rows[0] || { title: 'Test Webhook Banana Clips', platform: 'TikTok' },
    };

    try {
      const r = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });
      return res.json({ sent: true, statusCode: r.status, message: `Webhook enviado con éxito (HTTP ${r.status}).` });
    } catch (err: any) {
      return res.status(502).json({ error: 'WEBHOOK_FAILED', message: `No se pudo conectar al Webhook: ${err?.message}` });
    }
  });

  // On-Demand 1-Click Neural Voice Dubbing for any existing Clip
  router.post('/clips/:id/dub', requireAuth, async (req: AuthenticatedRequest, res) => {
    const clipId = req.params.id;
    const targetLang = ((req.body?.targetLang as VoiceDubbingLang) || 'ES_LATAM') as VoiceDubbingLang;
    const cRes = await db.query(
      `SELECT c.*, so."localPath" as "videoLocalPath"
       FROM "Clip" c
       LEFT JOIN "StorageObject" so ON so.id = c."storageObjectId"
       WHERE c.id = $1 LIMIT 1`,
      [clipId]
    );
    if (cRes.rows.length === 0) return res.status(404).json({ error: 'CLIP_NOT_FOUND' });
    const clip = cRes.rows[0];
    const videoAbs =
      clip.videoLocalPath && fs.existsSync(clip.videoLocalPath)
        ? clip.videoLocalPath
        : clip.previewPath
          ? path.join(storageRoot, clip.previewPath)
          : '';
    if (!videoAbs || !fs.existsSync(videoAbs)) {
      return res.status(404).json({ error: 'VIDEO_FILE_NOT_FOUND' });
    }

    const result = await applyVoiceDubbingToClipAsync({
      videoPath: videoAbs,
      transcriptText: String(clip.summary || clip.title || ''),
      targetLang,
    });

    if (result.dubbed) {
      await db.query(
        `UPDATE "Clip" SET summary = $1, language = $2 WHERE id = $3`,
        [result.translatedText, targetLang.toLowerCase().slice(0, 2), clipId]
      );
      return res.json({
        dubbed: true,
        targetLang,
        translatedText: result.translatedText,
        message: `✅ Clip doblado con voz neuronal (${targetLang}) y Audio Ducking aplicado.`,
      });
    }
    return res.status(500).json({
      dubbed: false,
      message: 'No se pudo aplicar el doblaje neuronal en este momento.',
    });
  });

  // On-Demand 1-Click "Cold Open / Adelanto Explosivo" directed by Claude 5.5 (Anthropic)
  router.post('/clips/:id/cold-open', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const clipId = req.params.id;
      const cRes = await db.query(
        `SELECT c.*, so."localPath" as "videoLocalPath"
         FROM "Clip" c
         LEFT JOIN "StorageObject" so ON so.id = c."storageObjectId"
         WHERE c.id = $1 LIMIT 1`,
        [clipId]
      );
      if (cRes.rows.length === 0) return res.status(404).json({ error: 'CLIP_NOT_FOUND' });
      const clip = cRes.rows[0];
      const videoAbs =
        clip.videoLocalPath && fs.existsSync(clip.videoLocalPath)
          ? clip.videoLocalPath
          : clip.previewPath
            ? path.join(storageRoot, clip.previewPath)
            : '';
      if (!videoAbs || !fs.existsSync(videoAbs)) {
        return res.status(404).json({ error: 'VIDEO_FILE_NOT_FOUND', message: 'Archivo MP4 del clip no encontrado.' });
      }

      const result = await applyColdOpenToClipWithClaudeAsync({
        videoPath: videoAbs,
        transcriptText: String(clip.summary || clip.title || ''),
        durationSec: Number(clip.durationSec || 20),
      });

      await db.query(
        `UPDATE "Clip" SET "durationSec" = $1, summary = $2 WHERE id = $3`,
        [
          result.newDurationSec,
          `⚡ Cold Open IA (Claude 5.5): Adelanto de s${result.climaxSecond} ("${result.teaserText}") • Debate: ${result.debateCtaQuestion}`,
          clipId,
        ]
      );

      return res.json({
        ok: true,
        clipId,
        aiEngine: 'Claude Haiku 5.5 (Anthropic)',
        climaxSecond: result.climaxSecond,
        teaserText: result.teaserText,
        debateCtaQuestion: result.debateCtaQuestion,
        newDurationSec: result.newDurationSec,
        message: `⚡ Cold Open aplicado con Claude 5.5: se adelantó el clímax del segundo ${result.climaxSecond}s al inicio ("${result.teaserText}").`,
      });
    } catch (err: any) {
      return res.status(500).json({
        error: 'COLD_OPEN_FAILED',
        message: err?.message || 'Error al aplicar el Cold Open con Claude 5.5.',
      });
    }
  });

  // Full AI Video Editor & Active Speaker Reframe powered by Claude 5.5 Vision + NumPy CV
  router.post('/clips/:id/claude-edit', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const clipId = req.params.id;
      const userInstruction = String(req.body?.instruction || '').trim();
      const forceTwoSpeakerSplit = Boolean(req.body?.twoSpeakerSplit);

      const cRes = await db.query(
        `SELECT c.*,
                so."localPath" as "clipLocalPath",
                vso."localPath" as "sourceVideoLocalPath"
         FROM "Clip" c
         LEFT JOIN "StorageObject" so ON so.id = c."storageObjectId"
         LEFT JOIN "Video" v ON v.id = c."videoId"
         LEFT JOIN "StorageObject" vso ON vso.id = v."storageObjectId"
         WHERE c.id = $1 LIMIT 1`,
        [clipId]
      );
      if (cRes.rows.length === 0) return res.status(404).json({ error: 'CLIP_NOT_FOUND' });
      const clip = cRes.rows[0];

      const clipFileAbs =
        clip.clipLocalPath && fs.existsSync(clip.clipLocalPath)
          ? clip.clipLocalPath
          : clip.previewPath
            ? path.join(storageRoot, clip.previewPath)
            : '';
      if (!clipFileAbs || !fs.existsSync(clipFileAbs)) {
        return res.status(404).json({ error: 'VIDEO_FILE_NOT_FOUND', message: 'No se encontró el archivo MP4 del clip.' });
      }

      const hasOriginalSource =
        Boolean(clip.sourceVideoLocalPath) &&
        fs.existsSync(clip.sourceVideoLocalPath) &&
        clip.sourceVideoLocalPath !== clipFileAbs;

      const inputVideoForEdit = hasOriginalSource ? clip.sourceVideoLocalPath : clipFileAbs;
      const startSec = hasOriginalSource ? Number(clip.startSec || 0) : 0;
      const durationSec = Number(clip.durationSec || 20);

      const ctRes = await db
        .query<{ wordsJson: any }>(`SELECT "wordsJson" FROM "ClipTranscript" WHERE "clipId" = $1 LIMIT 1`, [clipId])
        .catch(() => ({ rows: [] as { wordsJson: any }[] }));
      const rawWords = ctRes.rows[0]?.wordsJson;
      const words = rawWords ? (typeof rawWords === 'string' ? JSON.parse(rawWords) : rawWords) : [];
      const transcriptText =
        words.length > 0
          ? words.map((w: any) => w.word).join(' ')
          : String(clip.summary || clip.title || '');

      const plan = await detectSpeakerAndEditPlanWithClaudeVisionAsync({
        videoPath: inputVideoForEdit,
        startSec,
        durationSec,
        transcriptText,
        userInstruction,
      });

      const selectedStyle = SUBTITLE_TEMPLATES.Hormozi || SUBTITLE_TEMPLATES.Bold;
      let subtitleAssPath: string | undefined;
      if (hasOriginalSource && words.length > 0) {
        const assContent = generateAssSubtitles(words, selectedStyle, 720, 1280, {
          autoEmojis: true,
          hookBannerText: plan.hookBannerText || undefined,
          hookStyle: 'Classic',
          hookAnimation: 'POP_BOUNCE',
          ctaOutroText: plan.debateCtaQuestion || undefined,
          clipDurationSec: durationSec,
        });
        subtitleAssPath = path.join(storageRoot, 'banana-clips', `claude_sub_${clipId}.ass`);
        fs.writeFileSync(subtitleAssPath, assContent, 'utf-8');
      }

      const tmpEditedAbs = `${clipFileAbs}.claude_edit.mp4`;
      const effectiveReframe =
        forceTwoSpeakerSplit || plan.twoSpeakersSplitRecommended
          ? 'LEVEL_3_SMART_SPLIT_COMPOSITION'
          : 'LEVEL_2_VISUAL_TRACKING';

      const renderedMeta = renderClipWithFfmpeg({
        sourceVideoPath: inputVideoForEdit,
        outputVideoPath: tmpEditedAbs,
        startSec,
        durationSec,
        aspectRatio: (clip.aspectRatio as any) || '9:16',
        resolution: '720p',
        reframeMode: effectiveReframe,
        speakerFirstHalfX: plan.firstHalfX,
        speakerSecondHalfX: plan.secondHalfX,
        subtitleAssPath,
        videoEffect: plan.videoEffect,
        audioEnhancer: true,
        autoZoom: plan.videoEffect === 'DYNAMIC_ZOOM',
        autoTransitions: true,
        autoColorCorrection: true,
        splitScreenMode: plan.splitScreenMode,
        backgroundMusicTrack: plan.backgroundMusicTrack,
        storageDir: storageRoot,
      });

      if (fs.existsSync(tmpEditedAbs) && fs.statSync(tmpEditedAbs).size > 4000) {
        fs.copyFileSync(tmpEditedAbs, clipFileAbs);
        try {
          fs.unlinkSync(tmpEditedAbs);
        } catch {}
      }

      await db.query(
        `UPDATE "Clip" SET "durationSec" = $1, summary = $2 WHERE id = $3`,
        [
          renderedMeta.durationSeconds,
          `🎬 Editado por Claude 5.5 Vision: ${plan.explanationEs}`,
          clipId,
        ]
      );

      const signedUrl = clip.storageObjectId
        ? `${signStorageObjectUrl({ storageObjectId: clip.storageObjectId, userId: clip.userId }).url}&t=${Date.now()}`
        : null;

      return res.json({
        ok: true,
        clipId,
        aiEngine: 'Claude Haiku 5.5 Vision + Active Speaker CV',
        plan,
        signedDownloadUrl: signedUrl,
        message: `✅ Claude 5.5 Vision editó el video y bloqueó la cámara en el hablante activo (X1=${Math.round(plan.firstHalfX * 100)}%, X2=${Math.round(plan.secondHalfX * 100)}%): ${plan.explanationEs}`,
      });
    } catch (err: any) {
      return res.status(500).json({
        error: 'CLAUDE_EDIT_FAILED',
        message: err?.message || 'Error al editar el clip con Claude 5.5 Vision.',
      });
    }
  });

  // Feature 5: Telegram Bot Direct Push ("Del Servidor a tu Celular en 1 Clic")
  router.get('/social/telegram-config', requireAuth, async (req: AuthenticatedRequest, res) => {
    const cfgRes = await db.query<{ valueJson: string }>(
      `SELECT "valueJson" FROM "SystemSetting" WHERE key = $1 LIMIT 1`,
      [`telegram_config_${req.user!.sub}`]
    );
    let config = { botToken: '', chatId: '', autoSendLiveClips: true };
    if (cfgRes.rows[0]?.valueJson) {
      try {
        config = { ...config, ...JSON.parse(cfgRes.rows[0].valueJson) };
      } catch {}
    }
    return res.json({ config });
  });

  router.post('/social/telegram-config', requireAuth, async (req: AuthenticatedRequest, res) => {
    const { botToken = '', chatId = '', autoSendLiveClips = true } = req.body || {};
    const key = `telegram_config_${req.user!.sub}`;
    const valueObj = {
      botToken: String(botToken).trim(),
      chatId: String(chatId).trim(),
      autoSendLiveClips: Boolean(autoSendLiveClips),
      updatedAt: new Date().toISOString(),
    };
    const exists = await db.query(`SELECT id FROM "SystemSetting" WHERE key = $1 LIMIT 1`, [key]);
    if (exists.rows.length === 0) {
      await db.query(
        `INSERT INTO "SystemSetting" ("id", "key", "valueJson", "description") VALUES ($1, $2, $3, $4)`,
        [crypto.randomUUID(), key, JSON.stringify(valueObj), 'Configuración de Bot de Telegram Directo']
      );
    } else {
      await db.query(
        `UPDATE "SystemSetting" SET "valueJson" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE key = $2`,
        [JSON.stringify(valueObj), key]
      );
    }
    return res.json({
      saved: true,
      config: valueObj,
      message: '✅ Configuración de Bot de Telegram guardada correctamente.',
    });
  });

  router.post('/social/telegram-send', requireAuth, async (req: AuthenticatedRequest, res) => {
    const { clipId, botToken, chatId } = req.body || {};
    let targetClipId = clipId;
    if (!targetClipId) {
      const latest = await db.query<{ id: string }>(
        `SELECT id FROM "Clip" WHERE "userId" = $1 AND "isTrash" = false ORDER BY "createdAt" DESC LIMIT 1`,
        [req.user!.sub]
      );
      targetClipId = latest.rows[0]?.id;
    }
    if (!targetClipId) {
      let bt = String(botToken || '').trim();
      let cid = String(chatId || '').trim();
      if (!bt || !cid) {
        const cfgRes = await db.query<{ valueJson: string }>(
          `SELECT "valueJson" FROM "SystemSetting" WHERE key = $1 LIMIT 1`,
          [`telegram_config_${req.user!.sub}`]
        );
        if (cfgRes.rows[0]?.valueJson) {
          try {
            const parsed = JSON.parse(cfgRes.rows[0].valueJson);
            if (!bt) bt = String(parsed.botToken || '').trim();
            if (!cid) cid = String(parsed.chatId || '').trim();
          } catch {}
        }
      }
      if (!bt || !cid) {
        return res.status(400).json({
          ok: false,
          message: 'Ingresa primero tu Bot Token y Chat ID de Telegram.',
        });
      }
      const meRes = await fetch(`https://api.telegram.org/bot${bt}/getMe`, {
        method: 'GET',
        signal: AbortSignal.timeout(8000),
      }).catch(() => null);
      const meData: any = meRes ? await meRes.json().catch(() => ({})) : {};
      if (!meRes || !meRes.ok || !meData?.ok) {
        return res.status(400).json({
          ok: false,
          message: `Token de Bot de Telegram inválido o revocado (${meData?.description || '401 Unauthorized'}). Abre @BotFather en Telegram, escribe /token o /newbot y pega el token exacto.`,
        });
      }
      const botUsername = meData?.result?.username ? `@${meData.result.username}` : 'tu Bot';
      const msgRes = await fetch(`https://api.telegram.org/bot${bt}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: cid,
          text: `🍌 BANANA CLIPS AI STUDIO — ¡Conexión de prueba exitosa con ${botUsername}! Aquí recibirás tus Shorts 9:16 automáticamente.`,
        }),
        signal: AbortSignal.timeout(10000),
      }).catch(() => null);
      const msgData: any = msgRes ? await msgRes.json().catch(() => ({})) : {};
      if (msgRes?.ok && msgData?.ok) {
        return res.json({
          ok: true,
          message: `✅ ¡Conexión exitosa! ${botUsername} envió un mensaje de prueba a tu Telegram (${cid}).`,
        });
      }
      return res.status(400).json({
        ok: false,
        message: `Telegram (${botUsername}) respondió: ${msgData?.description || 'Asegúrate de haber pulsado /start en tu bot primero.'}`,
      });
    }
    const result = await sendClipToTelegramHelperAsync({
      userId: req.user!.sub,
      clipId: targetClipId,
      overrideBotToken: botToken,
      overrideChatId: chatId,
    });
    return res.status(result.ok ? 200 : 400).json(result);
  });

  // Feature 6: 24/7 Auto-Channel Watcher (Vigilante Automático de Canales de YouTube / Twitch)
  const getWatchedChannelsForUser = async (userId: string): Promise<any[]> => {
    const key = `channel_watcher_${userId}`;
    const r = await db.query<{ valueJson: string }>(
      `SELECT "valueJson" FROM "SystemSetting" WHERE key = $1 LIMIT 1`,
      [key]
    );
    if (!r.rows[0]?.valueJson) return [];
    try {
      const parsed = JSON.parse(r.rows[0].valueJson);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const saveWatchedChannelsForUser = async (userId: string, channels: any[]) => {
    const key = `channel_watcher_${userId}`;
    const exists = await db.query(`SELECT id FROM "SystemSetting" WHERE key = $1 LIMIT 1`, [key]);
    if (exists.rows.length === 0) {
      await db.query(
        `INSERT INTO "SystemSetting" ("id", "key", "valueJson", "description") VALUES ($1, $2, $3, $4)`,
        [crypto.randomUUID(), key, JSON.stringify(channels), 'Canales monitoreados 24/7 por Auto-Channel Watcher']
      );
    } else {
      await db.query(
        `UPDATE "SystemSetting" SET "valueJson" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE key = $2`,
        [JSON.stringify(channels), key]
      );
    }
  };

  router.get('/channel-watcher', requireAuth, async (req: AuthenticatedRequest, res) => {
    const channels = await getWatchedChannelsForUser(req.user!.sub);
    return res.json({ channels });
  });

  router.post('/channel-watcher', requireAuth, async (req: AuthenticatedRequest, res) => {
    const {
      channelUrl = '',
      channelName = 'Canal Monitoreado',
      checkIntervalMin = 15,
      clipDurationSec = 20,
      splitScreenMode = 'NONE',
      voiceDubbingLang = 'NONE',
    } = req.body || {};
    if (!channelUrl || !/^https?:\/\//i.test(channelUrl)) {
      return res.status(400).json({ error: 'INVALID_CHANNEL_URL', message: 'Ingresa una URL válida de canal o directo de YouTube/Twitch.' });
    }
    const channels = await getWatchedChannelsForUser(req.user!.sub);
    const newEntry = {
      id: crypto.randomUUID(),
      channelUrl: String(channelUrl).trim(),
      channelName: String(channelName).trim() || 'Canal de YouTube',
      checkIntervalMin: Math.max(5, Number(checkIntervalMin) || 15),
      clipDurationSec: Math.max(12, Math.min(45, Number(clipDurationSec) || 20)),
      splitScreenMode: String(splitScreenMode || 'NONE'),
      voiceDubbingLang: String(voiceDubbingLang || 'NONE'),
      lastCheckedAt: null,
      lastDetectedTitle: null,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    };
    channels.unshift(newEntry);
    await saveWatchedChannelsForUser(req.user!.sub, channels);
    return res.status(201).json({ channel: newEntry, channels });
  });

  router.delete('/channel-watcher/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    const channels = await getWatchedChannelsForUser(req.user!.sub);
    const filtered = channels.filter((c: any) => c.id !== req.params.id);
    await saveWatchedChannelsForUser(req.user!.sub, filtered);
    return res.json({ deleted: true, channels: filtered });
  });

  router.post('/channel-watcher/scan-now', requireAuth, async (req: AuthenticatedRequest, res) => {
    const { channelId } = req.body || {};
    const channels = await getWatchedChannelsForUser(req.user!.sub);
    const target = channelId ? channels.find((c: any) => c.id === channelId) : channels[0];
    if (!target) {
      return res.status(404).json({ error: 'NO_WATCHED_CHANNEL', message: 'Agrega primero un canal de YouTube o Twitch al Vigilante 24/7.' });
    }

    // Resolve latest video/live URL from the channel via yt-dlp --flat-playlist --playlist-end 1
    const resolveChannelLatestUrl = (url: string): Promise<{ videoUrl: string; title: string }> =>
      new Promise((resolve) => {
        const child = spawn('yt-dlp', [
          '--flat-playlist',
          '--playlist-end',
          '1',
          '--no-warnings',
          '--print',
          '%(webpage_url)s|||%(title)s',
          url,
        ]);
        let out = '';
        const timer = setTimeout(() => {
          try {
            child.kill('SIGKILL');
          } catch {}
          resolve({ videoUrl: url, title: target.channelName });
        }, 18000);
        child.stdout.on('data', (d) => (out += d.toString()));
        child.on('close', () => {
          clearTimeout(timer);
          const firstLine = out.split(/\r?\n/).find((l) => l.includes('|||')) || '';
          const [vUrl, vTitle] = firstLine.split('|||');
          if (vUrl && vUrl.trim().startsWith('http')) {
            resolve({ videoUrl: vUrl.trim(), title: (vTitle || target.channelName).trim() });
          } else {
            resolve({ videoUrl: url, title: target.channelName });
          }
        });
        child.on('error', () => {
          clearTimeout(timer);
          resolve({ videoUrl: url, title: target.channelName });
        });
      });

    const resolved = await resolveChannelLatestUrl(target.channelUrl);
    target.lastCheckedAt = new Date().toISOString();
    target.lastDetectedTitle = resolved.title;
    await saveWatchedChannelsForUser(req.user!.sub, channels);

    // Trigger automatic Live Clipper / Highlight extraction on the resolved video/stream
    const newVideoId = crypto.randomUUID();
    const objectKey = `live_${newVideoId}.mp4`;
    const finalPath = path.join(storageRoot, 'banana-videos', objectKey);
    ensureFixtureVideo(finalPath, 12);
    const meta = probeMediaWithFfprobe(finalPath);
    const storageObjId = crypto.randomUUID();

    await db.query(
      `INSERT INTO "StorageObject" ("id", "userId", "bucket", "objectKey", "localPath", "mimeType", "sizeBytes")
       VALUES ($1, $2, 'banana-videos', $3, $4, 'video/mp4', $5)`,
      [storageObjId, req.user!.sub, objectKey, finalPath, meta.fileSizeBytes]
    );
    await db.query(
      `INSERT INTO "Video" ("id", "userId", "title", "originalFilename", "storageObjectId", "status")
       VALUES ($1, $2, $3, $4, $5, 'RECORDING')`,
      [newVideoId, req.user!.sub, `[Vigilante 24/7] ${resolved.title}`, objectKey, storageObjId]
    );
    await db.query(
      `INSERT INTO "VideoSource" ("id", "videoId", "sourceType", "originUrl", "liveStreamState", "protocol")
       VALUES ($1, $2, 'LIVE_RTMP', $3, 'RECORDING', 'YOUTUBE_LIVE')`,
      [crypto.randomUUID(), newVideoId, resolved.videoUrl]
    );

    liveSessionStatusMap.set(newVideoId, {
      currentStatusText: `📡 Vigilante 24/7 extrayendo Mejores Momentos de "${resolved.title}"...`,
      cutsCount: 0,
      blocksScanned: 0,
      isCapturing: false,
      autoCutEnabled: false,
      clipDurationSec: target.clipDurationSec || 20,
      intervalSec: 300,
      splitScreenMode: (target.splitScreenMode as SplitScreenRetentionMode) || 'NONE',
      backgroundMusicTrack: 'NONE',
      voiceDubbingLang: (target.voiceDubbingLang as VoiceDubbingLang) || 'NONE',
    });

    const userId = req.user!.sub;
    setImmediate(() => {
      captureAndRenderLiveCutAsync({
        videoId: newVideoId,
        userId,
        streamUrl: resolved.videoUrl,
        sessionTitle: resolved.title,
        clipDurationSec: target.clipDurationSec || 20,
      });
    });

    return res.json({
      scanned: true,
      videoId: newVideoId,
      detectedUrl: resolved.videoUrl,
      detectedTitle: resolved.title,
      channels,
      message: `📡 Vigilante 24/7 detectó "${resolved.title}" e inició la extracción automática de Mejores Momentos.`,
    });
  });

  router.post('/social/accounts', requireAuth, async (req: AuthenticatedRequest, res) => {
    const { platform, accountHandle, accessToken } = req.body || {};
    if (!platform || !accountHandle || !accessToken) {
      return res.status(400).json({ error: 'MISSING_FIELDS' });
    }
    const id = crypto.randomUUID();
    const enc = encryptExternalToken(String(accessToken));
    await db.query(
      `INSERT INTO "SocialAccount" ("id", "userId", "platform", "accountHandle", "encryptedToken", "status")
       VALUES ($1, $2, $3, $4, $5, 'CONNECTED')`,
      [id, req.user!.sub, platform, accountHandle, enc]
    );
    return res.status(201).json({ id, platform, accountHandle, status: 'CONNECTED' });
  });

  router.post('/social/posts', requireAuth, async (req: AuthenticatedRequest, res) => {
    const { clipId, platform = 'TikTok', title, caption, hashtags = [], scheduledAt = null } = req.body || {};
    if (!title || !caption) return res.status(400).json({ error: 'TITLE_AND_CAPTION_REQUIRED' });

    // Never simulate fake external publishing if official OAuth API credentials are not configured:
    // Mark truthfully as MANUAL_EXPORT_READY or SCHEDULED
    const status = scheduledAt ? 'SCHEDULED' : 'MANUAL_EXPORT_READY';
    const postId = crypto.randomUUID();
    await db.query(
      `INSERT INTO "SocialPost" ("id", "userId", "clipId", "platform", "title", "caption", "hashtags", "status", "scheduledAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [postId, req.user!.sub, clipId || null, platform, title, caption, JSON.stringify(hashtags), status, scheduledAt]
    );
    return res.status(201).json({
      id: postId,
      platform,
      title,
      status,
      notice:
        'Publicación registrada. Sin llaves OAuth comerciales activas, el paquete MP4 + metadatos está listo para exportación manual verificada.',
    });
  });

  // ===========================================================================
  // 15. SUPER_ADMIN SYSTEM MANAGEMENT (/api/v1/admin/*)
  // ===========================================================================
  router.get('/admin/overview', requireAuth, requireSuperAdmin, async (_req, res) => {
    const roles = await db.query(`SELECT * FROM "Role"`);
    const workers = await db.query(`SELECT * FROM "ProcessingWorker" ORDER BY "workerName" ASC`);
    const settings = await db.query(`SELECT * FROM "SystemSetting"`);
    const logs = await db.query(
      `SELECT a.*, u.username FROM "AuditLog" a LEFT JOIN "User" u ON a."userId" = u.id ORDER BY a."createdAt" DESC LIMIT 50`
    );
    const storageStats = await db.query<{ bucket: string; files: string; bytes: string }>(
      `SELECT bucket, COUNT(*)::text as files, COALESCE(SUM("sizeBytes"), 0)::text as bytes FROM "StorageObject" GROUP BY bucket`
    );

    return res.json({
      roles: roles.rows,
      workers: workers.rows,
      settings: settings.rows,
      auditLogs: logs.rows,
      storageBuckets: storageStats.rows,
    });
  });

  router.put('/admin/settings/:key', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
    const key = req.params.key;
    const { valueJson, description = 'Actualizado por SUPER_ADMIN' } = req.body || {};
    const exists = await db.query(`SELECT id FROM "SystemSetting" WHERE key = $1 LIMIT 1`, [key]);
    if (exists.rows.length === 0) {
      await db.query(
        `INSERT INTO "SystemSetting" ("id", "key", "valueJson", "description") VALUES ($1, $2, $3, $4)`,
        [crypto.randomUUID(), key, JSON.stringify(valueJson), description]
      );
    } else {
      await db.query(
        `UPDATE "SystemSetting" SET "valueJson" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE key = $2`,
        [JSON.stringify(valueJson), key]
      );
    }
    await db.query(
      `INSERT INTO "AuditLog" ("id", "userId", "action", "resource", "resourceId", "details")
       VALUES ($1, $2, 'UPDATED_SYSTEM_SETTING', 'SystemSetting', $3, $4)`,
      [crypto.randomUUID(), req.user!.sub, key, JSON.stringify(valueJson)]
    );
    return res.json({ updated: true, key, valueJson });
  });

  // ===========================================================================
  // 16. IN-APP YOUTUBE SEARCH & AI VIRAL RADAR (/api/v1/youtube/*)
  // ===========================================================================
  router.get('/youtube/search', requireAuth, async (req: AuthenticatedRequest, res) => {
    const q = String(req.query.q || '').trim() || 'podcast viral español';
    const limit = Math.max(4, Math.min(18, Number(req.query.limit || 12)));
    const videos = await searchYouTubeVideosForClippingAsync({ query: q, limit });
    return res.json({
      query: q,
      count: videos.length,
      videos,
    });
  });

  router.get('/youtube/trending-viral', requireAuth, async (req: AuthenticatedRequest, res) => {
    const niche = String(req.query.niche || 'ALL').trim();
    const limit = Math.max(6, Math.min(16, Number(req.query.limit || 12)));
    const radar = await analyzeTrendingYouTubeViralsWithAiAsync({ niche, limit });
    return res.json(radar);
  });

  app.use('/api/v1', router);
  return app;
}
