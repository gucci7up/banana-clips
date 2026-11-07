import * as crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { getDb } from '@banana/database';

export interface JwtUserPayload {
  sub: string;
  username: string;
  role: 'SUPER_ADMIN' | 'USER';
  mustChangePassword: boolean;
  iat: number;
  exp: number;
}

const ACCESS_SECRET = () => process.env.JWT_ACCESS_SECRET || 'banana-studio-access-secret-key-2026';
const REFRESH_SECRET = () => process.env.JWT_REFRESH_SECRET || 'banana-studio-refresh-secret-key-2026';

export function signJwtToken(
  payload: Omit<JwtUserPayload, 'iat' | 'exp'>,
  expiresInSeconds: number = 900,
  isRefresh = false
): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JwtUserPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };
  const headerB64 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const bodyB64 = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const secret = isRefresh ? REFRESH_SECRET() : ACCESS_SECRET();
  const sig = crypto.createHmac('sha256', secret).update(`${headerB64}.${bodyB64}`).digest('base64url');
  return `${headerB64}.${bodyB64}.${sig}`;
}

export function verifyJwtToken(token: string, isRefresh = false): JwtUserPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, bodyB64, sig] = parts;
    const secret = isRefresh ? REFRESH_SECRET() : ACCESS_SECRET();
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(`${headerB64}.${bodyB64}`)
      .digest('base64url');
    if (sig !== expectedSig) return null;
    const payload = JSON.parse(Buffer.from(bodyB64, 'base64url').toString('utf-8')) as JwtUserPayload;
    if (Math.floor(Date.now() / 1000) > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function encryptExternalToken(plainText: string): string {
  const keyHex = (process.env.ENCRYPTION_KEY_HEX || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef').slice(0, 64);
  const key = Buffer.from(keyHex, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plainText, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export interface AuthenticatedRequest extends Request {
  user?: JwtUserPayload;
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const cookieToken = req.cookies?.banana_access_token;
  const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;
  const rawToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : cookieToken || queryToken;

  if (!rawToken) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Autenticación requerida. Banana Clips es una plataforma privada.',
    });
  }

  const payload = verifyJwtToken(rawToken, false);
  if (!payload) {
    return res.status(401).json({
      error: 'INVALID_OR_EXPIRED_TOKEN',
      message: 'Sesión expirada o token inválido.',
    });
  }

  // Verify user is still ACTIVE and has at least one non-revoked session
  const db = await getDb();
  const userCheck = await db.query<{ status: string; roleName: 'SUPER_ADMIN' | 'USER'; mustChangePassword: boolean }>(
    `SELECT u.status, u."mustChangePassword", r.name as "roleName"
     FROM "User" u JOIN "Role" r ON u."roleId" = r.id
     WHERE u.id = $1 LIMIT 1`,
    [payload.sub]
  );

  if (userCheck.rows.length === 0 || userCheck.rows[0].status !== 'ACTIVE') {
    return res.status(403).json({
      error: 'ACCOUNT_DISABLED',
      message: 'Tu cuenta ha sido desactivada o no existe.',
    });
  }

  const activeSessions = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM "Session" WHERE "userId" = $1 AND "isRevoked" = false AND "expiresAt" > CURRENT_TIMESTAMP`,
    [payload.sub]
  );
  if (Number(activeSessions.rows[0]?.count || 0) === 0) {
    return res.status(401).json({
      error: 'SESSION_REVOKED',
      message: 'Tu sesión fue revocada por seguridad. Inicia sesión nuevamente.',
    });
  }

  req.user = {
    ...payload,
    role: userCheck.rows[0].roleName,
    mustChangePassword: userCheck.rows[0].mustChangePassword,
  };
  return next();
}

export function requireSuperAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({
      error: 'FORBIDDEN_SUPER_ADMIN_ONLY',
      message: 'Acceso denegado. Esta operación requiere privilegios de SUPER_ADMIN.',
    });
  }
  return next();
}
