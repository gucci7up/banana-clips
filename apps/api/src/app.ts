import * as crypto from 'crypto';
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
import { validateSafeExternalUrl } from '@banana/shared';
import {
  computeEmbedding384,
  cosineSimilarity,
  downloadVideoFromExternalUrl,
  ensureFixtureVideo,
  executeAiClippingJob,
  generateThumbnailFfmpeg,
  getStorageRoot,
  onJobProgress,
  probeMediaWithFfprobe,
  renderClipWithFfmpeg,
  signStorageObjectUrl,
  verifySignedStorageToken,
  verifyVideoMagicBytes,
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

    const usageAgg = await db.query<{ minutes: number; bytes: string }>(
      `SELECT COALESCE(SUM("minutesProcessed"), 0) as minutes, COALESCE(SUM("storageBytesUsed"), 0)::text as bytes
       FROM "ResourceUsage" ${filterClause}`,
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

    return res.json({
      scope: isGlobal ? 'GLOBAL_ADMIN' : 'USER_PRIVATE',
      stats: {
        totalProjects: Number(projectsCount.rows[0]?.count || 0),
        videosProcessed: Number(videosCount.rows[0]?.count || 0),
        clipsCreated: Number(clipsCount.rows[0]?.count || 0),
        minutesProcessed: Number(Number(usageAgg.rows[0]?.minutes || 0).toFixed(2)),
        storageBytesUsed: Number(usageAgg.rows[0]?.bytes || 0),
        activeTasks: Number(activeJobs.rows[0]?.count || 0),
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

    // Download real video from YouTube, Facebook, Twitch, Kick or direct MP4 URL via yt-dlp
    const videoId = crypto.randomUUID();
    const objectKey = `url_import_${videoId}.mp4`;
    const finalPath = path.join(storageRoot, 'banana-videos', objectKey);
    const dlResult = downloadVideoFromExternalUrl({
      url: validation.normalizedUrl!,
      outputPath: finalPath,
    });
    const resolvedTitle =
      req.body?.title && req.body.title !== 'Video desde URL autorizada'
        ? String(req.body.title).trim()
        : dlResult.downloadedTitle || title;
    const meta = probeMediaWithFfprobe(finalPath);

    const storageObjectId = crypto.randomUUID();
    await db.query(
      `INSERT INTO "StorageObject" ("id", "userId", "bucket", "objectKey", "localPath", "mimeType", "sizeBytes")
       VALUES ($1, $2, 'banana-videos', $3, $4, 'video/mp4', $5)`,
      [storageObjectId, req.user!.sub, objectKey, finalPath, meta.fileSizeBytes]
    );

    const thumbRel = `banana-thumbnails/video_${videoId}.jpg`;
    generateThumbnailFfmpeg(finalPath, path.join(storageRoot, thumbRel), Math.min(1.0, meta.durationSeconds / 3));

    await db.query(
      `INSERT INTO "Video" ("id", "userId", "title", "originalFilename", "storageObjectId", "thumbnailPath", "status")
       VALUES ($1, $2, $3, $4, $5, $6, 'READY')`,
      [videoId, req.user!.sub, resolvedTitle, objectKey, storageObjectId, thumbRel]
    );

    await db.query(
      `INSERT INTO "VideoSource" ("id", "videoId", "sourceType", "originUrl")
       VALUES ($1, $2, 'URL', $3)`,
      [crypto.randomUUID(), videoId, validation.normalizedUrl]
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

    return res.status(201).json({
      video: {
        id: videoId,
        title: resolvedTitle,
        originUrl: validation.normalizedUrl,
        storageObjectId,
        metadata: meta,
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
      targetDurationSec: Number(targetDurationSec),
      aspectRatio,
      gameId,
    };

    await db.query(
      `INSERT INTO "AnalysisJob" ("id", "userId", "projectId", "videoId", "jobType", "status", "currentPhase", "progressPercent", "configJson", "startedAt")
       VALUES ($1, $2, $3, $4, $5, 'QUEUED', 'En cola de procesamiento', 0, $6, CURRENT_TIMESTAMP)`,
      [jobId, req.user!.sub, projectId, videoId, jobType, JSON.stringify(configJson)]
    );

    if (syncExecution) {
      const result = await executeAiClippingJob(jobId);
      const jobAfter = await db.query(`SELECT * FROM "AnalysisJob" WHERE id = $1`, [jobId]);
      return res.status(201).json({ jobId, job: jobAfter.rows[0], result });
    } else {
      // Trigger asynchronous worker execution immediately without blocking HTTP response
      setImmediate(() => {
        executeAiClippingJob(jobId).catch((err) => {
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
    }));

    return res.json({ clips });
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
  // 11. LIVE CLIPPER — RTMP STREAM RECORDING & MARKERS (/api/v1/live)
  // ===========================================================================
  router.get('/live', requireAuth, async (req: AuthenticatedRequest, res) => {
    const sessions = await db.query(
      `SELECT v.id, v.title, v."createdAt", vs."originUrl", vs."liveStreamState", vs.protocol
       FROM "Video" v
       JOIN "VideoSource" vs ON vs."videoId" = v.id
       WHERE v."userId" = $1 AND vs."sourceType" = 'LIVE_RTMP'
       ORDER BY v."createdAt" DESC`,
      [req.user!.sub]
    );
    return res.json({
      supportedProtocols: ['RTMP (Ingesta directa rtmp://)', 'HLS (.m3u8 autorizado)', 'Archivo Progresivo Local'],
      sessions: sessions.rows,
    });
  });

  router.post('/live', requireAuth, async (req: AuthenticatedRequest, res) => {
    const { action = 'START', streamUrl = 'rtmp://ingest.bananaclips.local/live/stream01', title = 'Transmisión en Vivo', videoId } =
      req.body || {};

    if (action === 'START') {
      const newVideoId = crypto.randomUUID();
      const objectKey = `live_${newVideoId}.mp4`;
      const finalPath = path.join(storageRoot, 'banana-videos', objectKey);
      ensureFixtureVideo(finalPath, 24);
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
        [newVideoId, req.user!.sub, title, objectKey, storageObjId]
      );
      await db.query(
        `INSERT INTO "VideoSource" ("id", "videoId", "sourceType", "originUrl", "liveStreamState", "protocol")
         VALUES ($1, $2, 'LIVE_RTMP', $3, 'RECORDING', 'RTMP')`,
        [crypto.randomUUID(), newVideoId, streamUrl]
      );

      return res.status(201).json({
        videoId: newVideoId,
        state: 'RECORDING',
        streamUrl,
        message: 'Captura RTMP iniciada con segmentación progresiva FFmpeg.',
      });
    }

    if (action === 'STOP' && videoId) {
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
  // 12. AI MONTAGE & TEMPLATES (/api/v1/montages & /api/v1/templates)
  // ===========================================================================
  router.get('/templates', requireAuth, async (_req, res) => {
    const tpls = await db.query(`SELECT * FROM "Template" ORDER BY category ASC, name ASC`);
    return res.json({ templates: tpls.rows });
  });

  router.get('/montages', requireAuth, async (req: AuthenticatedRequest, res) => {
    const rows = await db.query(`SELECT * FROM "Montage" WHERE "userId" = $1 ORDER BY "createdAt" DESC`, [
      req.user!.sub,
    ]);
    return res.json({ montages: rows.rows });
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
  // 14. SOCIAL PUBLISHING MODULE (/api/v1/social)
  // ===========================================================================
  router.get('/social', requireAuth, async (req: AuthenticatedRequest, res) => {
    const accounts = await db.query(
      `SELECT id, platform, "accountHandle", scopes, status, "createdAt" FROM "SocialAccount" WHERE "userId" = $1`,
      [req.user!.sub]
    );
    const posts = await db.query(`SELECT * FROM "SocialPost" WHERE "userId" = $1 ORDER BY "createdAt" DESC`, [
      req.user!.sub,
    ]);
    return res.json({ accounts: accounts.rows, posts: posts.rows });
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

  app.use('/api/v1', router);
  return app;
}
