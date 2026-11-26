import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '../..');

export function loadEnv(customEnvPath = null) {
  const envPath = customEnvPath || path.join(ROOT_DIR, '.env');
  if (fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  }
}

loadEnv();

export function getEnvConfig() {
  return {
    appName: process.env.APP_NAME || 'Ehtyajatak for Sustainable Development',
    appEnv: process.env.APP_ENV || 'development',
    appDebug: process.env.APP_DEBUG === 'true',
    appUrl: process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000',
    port: Number.parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1'),
    defaultLanguage: process.env.DEFAULT_LANGUAGE || 'ar',
    supportedLanguages: (process.env.SUPPORTED_LANGUAGES || 'ar,en')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s === 'ar' || s === 'en'),
    dbDriver: process.env.DB_DRIVER || 'sqlite',
    sqlitePath: path.resolve(ROOT_DIR, process.env.SQLITE_PATH || './storage/ehtyajatak.sqlite'),
    sessionSecret: process.env.SESSION_SECRET || '',
    csrfSecret: process.env.CSRF_SECRET || '',
    authCookieName: process.env.AUTH_COOKIE_NAME || 'ehtyajatak_session',
    sessionTtlSeconds: Number.parseInt(process.env.SESSION_TTL_SECONDS || '86400', 10),
    rememberMeTtlSeconds: Number.parseInt(process.env.REMEMBER_ME_TTL_SECONDS || '2592000', 10),
    cookieSecure: process.env.COOKIE_SECURE === 'true',
    cookieSameSite: process.env.COOKIE_SAME_SITE || 'lax',
    passwordMinLength: Number.parseInt(process.env.PASSWORD_MIN_LENGTH || '10', 10),
    passwordResetTtlMinutes: Number.parseInt(process.env.PASSWORD_RESET_TTL_MINUTES || '30', 10),
    allowPublicRegistration: process.env.ALLOW_PUBLIC_REGISTRATION === 'true',
    requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION === 'true',
    uploadDir: path.resolve(ROOT_DIR, process.env.UPLOAD_DIR || './storage/uploads'),
    maxJsonBodyBytes: Number.parseInt(process.env.MAX_JSON_BODY_BYTES || '1048576', 10),
    maxFormBodyBytes: Number.parseInt(process.env.MAX_FORM_BODY_BYTES || '2097152', 10),
    maxMultipartBytes: Number.parseInt(process.env.MAX_MULTIPART_REQUEST_BYTES || '12582912', 10),
    trustProxy: process.env.TRUST_PROXY === 'true',
    corsAllowedOrigins: (process.env.CORS_ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    erpApiKey: process.env.ERP_API_KEY || ''
  };
}
