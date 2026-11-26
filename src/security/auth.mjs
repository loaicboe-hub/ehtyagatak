import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getEnvConfig, ROOT_DIR } from '../config/env.mjs';
import { queryAll, queryOne, runSql } from '../db/client.mjs';
import { generateOpaqueToken, hashTokenSha256 } from '../../foundation/security/token-utils.mjs';
import { generateCsrfToken, verifyCsrfToken } from '../../foundation/security/csrf.mjs';

const secHeaders = JSON.parse(
  fs.readFileSync(path.join(ROOT_DIR, 'foundation/security/security-headers.json'), 'utf8')
);

export function getSecurityHeaders(opts = {}) {
  const cfg = getEnvConfig();
  const headers = { ...secHeaders.headers };
  if (cfg.appEnv !== 'production') {
    delete headers['Strict-Transport-Security'];
  }
  if (opts.noReferrer) {
    headers['Referrer-Policy'] = 'no-referrer';
  }
  headers['Content-Security-Policy'] = [
    "default-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'self'",
    "img-src 'self' data: https:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "script-src 'self'"
  ].join('; ');
  return headers;
}

export function parseCookies(req) {
  const raw = req.headers.cookie || '';
  const result = {};
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    try {
      result[key] = decodeURIComponent(val);
    } catch {
      result[key] = val;
    }
  }
  return result;
}

export function formatCookie(name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${opts.path || '/'}`];
  if (opts.httpOnly !== false) parts.push('HttpOnly');
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  if (opts.secure) parts.push('Secure');
  if (typeof opts.maxAge === 'number') parts.push(`Max-Age=${Math.max(0, Math.floor(opts.maxAge))}`);
  return parts.join('; ');
}

export function getClientIp(req) {
  const cfg = getEnvConfig();
  if (cfg.trustProxy) {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.trim()) {
      return xff.split(',')[0].trim().slice(0, 45);
    }
  }
  return String(req.socket?.remoteAddress || '127.0.0.1').slice(0, 45);
}

export function logSecurityEvent(db, { eventType, severity = 'info', userId = null, ipAddress = null, userAgent = null, details = null }) {
  runSql(
    db,
    `INSERT INTO security_events (event_type, severity, user_id, ip_address, user_agent, details_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    eventType,
    severity,
    userId,
    ipAddress,
    userAgent ? String(userAgent).slice(0, 512) : null,
    details ? JSON.stringify(details) : null
  );
}

export function logAudit(db, { actorUserId = null, actorRole = null, action, entityType, entityId = null, before = null, after = null, ipAddress = null, source = 'admin' }) {
  runSql(
    db,
    `INSERT INTO audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, before_json, after_json, ip_address, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    actorUserId,
    actorRole,
    action,
    entityType,
    entityId !== null && entityId !== undefined ? String(entityId) : null,
    before ? JSON.stringify(before) : null,
    after ? JSON.stringify(after) : null,
    ipAddress,
    source
  );
}

export function createSession(db, { userId, ipAddress, userAgent, rememberMe = false }) {
  const cfg = getEnvConfig();
  const ttlSeconds = rememberMe ? cfg.rememberMeTtlSeconds : cfg.sessionTtlSeconds;
  const sessionId = crypto.randomBytes(32).toString('hex');
  const { rawToken, tokenHash } = generateOpaqueToken(32);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  runSql(
    db,
    `INSERT INTO user_sessions (id, user_id, token_hash, ip_address, user_agent, remember_me, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    sessionId,
    userId,
    tokenHash,
    ipAddress,
    userAgent ? String(userAgent).slice(0, 512) : null,
    rememberMe ? 1 : 0,
    expiresAt
  );

  return { sessionId, rawToken, expiresAt, ttlSeconds };
}

export function resolveSessionUser(db, req) {
  const cfg = getEnvConfig();
  const cookies = parseCookies(req);
  const rawToken = cookies[cfg.authCookieName];
  if (!rawToken) return null;

  const tokenHash = hashTokenSha256(rawToken);
  const nowIso = new Date().toISOString();

  const row = queryOne(
    db,
    `SELECT s.id AS session_id, s.user_id, s.expires_at, s.revoked_at,
            u.full_name, u.email, u.mobile_number, u.preferred_language, u.is_active,
            u.avatar_media_id, u.email_verified_at, u.last_login_at,
            r.id AS role_id, r.slug AS role_slug, r.name AS role_name
     FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     JOIN roles r ON r.id = u.role_id
     WHERE s.token_hash = ?`,
    tokenHash
  );

  if (!row || row.revoked_at || row.expires_at <= nowIso || !row.is_active) {
    return null;
  }

  runSql(db, "UPDATE user_sessions SET last_seen_at = datetime('now') WHERE id = ?", row.session_id);

  const permRows = queryAll(db, 'SELECT permission_key FROM role_permissions WHERE role_id = ?', row.role_id);
  const permissions = new Set(permRows.map((p) => p.permission_key));

  return {
    id: row.user_id,
    sessionId: row.session_id,
    fullName: row.full_name,
    email: row.email,
    mobileNumber: row.mobile_number,
    preferredLanguage: row.preferred_language,
    avatarMediaId: row.avatar_media_id,
    emailVerifiedAt: row.email_verified_at,
    lastLoginAt: row.last_login_at,
    role: row.role_slug,
    roleName: row.role_name,
    permissions
  };
}

export function hasPermission(user, permKey) {
  if (!user || !user.permissions) return false;
  if (user.permissions.has('*')) return true;
  return user.permissions.has(permKey);
}

export function isStaffRole(roleSlug) {
  return roleSlug === 'super_admin' || roleSlug === 'admin' || roleSlug === 'editor' || roleSlug === 'investor_manager';
}

export function ensureCsrfContext(req, res, user) {
  const cfg = getEnvConfig();
  if (user?.sessionId) {
    return generateCsrfToken({ secret: cfg.csrfSecret, sessionId: user.sessionId });
  }
  const cookies = parseCookies(req);
  let anonId = cookies.ehtyajatak_csrf_sid;
  if (!anonId || !/^[a-f0-9]{32}$/.test(anonId)) {
    anonId = crypto.randomBytes(16).toString('hex');
    const cookieStr = formatCookie('ehtyajatak_csrf_sid', anonId, {
      httpOnly: true,
      sameSite: cfg.cookieSameSite === 'strict' ? 'Strict' : 'Lax',
      secure: cfg.cookieSecure,
      maxAge: 43200
    });
    res.setHeader('Set-Cookie', appendSetCookie(res.getHeader('Set-Cookie'), cookieStr));
  }
  return generateCsrfToken({ secret: cfg.csrfSecret, sessionId: anonId });
}

export function verifyRequestCsrf(req, user, bodyToken = '') {
  const cfg = getEnvConfig();
  const headerToken = req.headers['x-csrf-token'];
  const token = typeof headerToken === 'string' && headerToken ? headerToken : String(bodyToken || '');
  if (!token) return false;

  if (user?.sessionId) {
    return verifyCsrfToken({ secret: cfg.csrfSecret, sessionId: user.sessionId, token });
  }
  const cookies = parseCookies(req);
  const anonId = cookies.ehtyajatak_csrf_sid;
  if (!anonId) return false;
  return verifyCsrfToken({ secret: cfg.csrfSecret, sessionId: anonId, token });
}

export function appendSetCookie(existing, newCookie) {
  if (!existing) return [newCookie];
  if (Array.isArray(existing)) return [...existing, newCookie];
  return [existing, newCookie];
}

export function verifyErpApiKey(req) {
  const cfg = getEnvConfig();
  if (!cfg.erpApiKey || cfg.erpApiKey.length < 24 || cfg.erpApiKey.startsWith('CHANGE_ME')) {
    return { configured: false, valid: false };
  }
  const provided = String(req.headers['x-erp-api-key'] || '');
  if (!provided) return { configured: true, valid: false };

  const bufA = Buffer.from(provided, 'utf8');
  const bufB = Buffer.from(cfg.erpApiKey, 'utf8');
  if (bufA.length !== bufB.length) return { configured: true, valid: false };
  return { configured: true, valid: crypto.timingSafeEqual(bufA, bufB) };
}
