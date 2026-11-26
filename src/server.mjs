import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getEnvConfig, ROOT_DIR } from './config/env.mjs';
import { getDb } from './db/client.mjs';
import { seedDatabase } from './db/seed.mjs';
import { parseRequestBody } from './http/body-parser.mjs';
import { sendHtml, sendJson } from './http/response.mjs';
import { getSecurityHeaders, parseCookies, resolveSessionUser } from './security/auth.mjs';
import { resolveProjectLanguage } from './i18n/index.mjs';
import { handlePublicRequest } from './routes/public.mjs';
import { handleAuthRequest } from './routes/auth.mjs';
import { handlePortalRequest } from './routes/portal.mjs';
import { handleAdminRequest } from './routes/admin.mjs';
import { handleErpApiRequest } from './routes/erp.mjs';

const MIME_MAP = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8'
};

function tryServeStaticAsset(res, pathname) {
  let baseDir = null;
  let relPath = null;

  if (pathname.startsWith('/foundation/design-system/')) {
    baseDir = path.join(ROOT_DIR, 'foundation/design-system');
    relPath = pathname.slice('/foundation/design-system/'.length);
  } else if (pathname.startsWith('/assets/') || pathname.startsWith('/css/') || pathname.startsWith('/js/')) {
    baseDir = path.join(ROOT_DIR, 'public');
    relPath = pathname.slice(1);
  }

  if (!baseDir || !relPath) return false;
  const resolved = path.resolve(baseDir, relPath);
  if (!resolved.startsWith(path.resolve(baseDir)) || !fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
    return false;
  }

  const ext = path.extname(resolved).toLowerCase();
  const mime = MIME_MAP[ext] || 'application/octet-stream';
  const content = fs.readFileSync(resolved);
  res.writeHead(200, {
    ...getSecurityHeaders(),
    'Content-Type': mime,
    'Cache-Control': 'public, max-age=3600'
  });
  res.end(content);
  return true;
}

export async function handleAppRequest(req, res, { db = getDb() } = {}) {
  try {
    const cfg = getEnvConfig();
    const baseOrigin = cfg.appUrl || 'http://localhost:3000';

    // In Vercel serverless rewrites, req.headers['x-matched-path'] holds the original path
    let reqUrlStr = req.url || '/';
    if (req.headers && req.headers['x-matched-path'] && (reqUrlStr.startsWith('/api') || reqUrlStr === '/')) {
      const matched = req.headers['x-matched-path'];
      const qIdx = reqUrlStr.indexOf('?');
      reqUrlStr = qIdx !== -1 && !matched.includes('?') ? `${matched}${reqUrlStr.slice(qIdx)}` : matched;
    }

    const url = new URL(reqUrlStr, baseOrigin);
    const pathname = url.pathname === '/' ? '/' : url.pathname.replace(/\/+$/, '');

    // CORS strict allowlist check (no wildcard with credentials)
    const origin = req.headers.origin;
    if (origin && cfg.corsAllowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token, X-ERP-API-KEY');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, getSecurityHeaders());
      res.end();
      return;
    }

    if (req.method === 'GET' && tryServeStaticAsset(res, pathname)) {
      return;
    }

    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      req._parsedBody = await parseRequestBody(req);
    }

    const cookies = parseCookies(req);
    const pathLangMatch = pathname.match(/^\/(ar|en)(?=\/|$)/);
    const queryLang = url.searchParams.get('lang');
    const user = resolveSessionUser(db, req);
    const lang = resolveProjectLanguage(
      pathLangMatch ? pathLangMatch[1] : (queryLang || cookies.site_lang || user?.preferredLanguage || cfg.defaultLanguage)
    );

    if (await handleErpApiRequest({ req, res, pathname, db })) return;
    if (await handleAuthRequest({ req, res, url, pathname, lang, db, user })) return;
    if (await handlePortalRequest({ req, res, url, pathname, lang, db, user })) return;
    if (await handleAdminRequest({ req, res, url, pathname, lang, db, user })) return;
    if (await handlePublicRequest({ req, res, url, pathname, lang, db, user })) return;

    if (pathname.startsWith('/api/')) {
      return sendJson(res, 404, { error: 'Endpoint not found.' });
    }
    return sendHtml(res, 404, `<!DOCTYPE html><html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="UTF-8"><title>404</title><link rel="stylesheet" href="/foundation/design-system/tokens.css"><link rel="stylesheet" href="/foundation/design-system/base.css"><link rel="stylesheet" href="/foundation/design-system/components.css"><link rel="stylesheet" href="/css/theme.css"></head><body><main class="auth-page"><div class="card stack"><h1>404</h1><p>${lang === 'ar' ? 'الصفحة غير موجودة.' : 'Page not found.'}</p><a class="btn btn--primary" href="/${lang}">${lang === 'ar' ? 'العودة للرئيسية' : 'Back to Home'}</a></div></main></body></html>`);
  } catch (err) {
    const status = err.statusCode || 500;
    const msg = status < 500 ? err.message : 'Internal server error.';
    if (req.url?.startsWith('/api/')) {
      return sendJson(res, status, { error: msg });
    }
    return sendHtml(res, status, `<h1>Error ${status}</h1><p>${msg}</p>`);
  }
}

export function createAppServer({ db = getDb() } = {}) {
  seedDatabase(db);

  return http.createServer(async (req, res) => {
    await handleAppRequest(req, res, { db });
  });
}

// Start server when executed directly
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const cfg = getEnvConfig();
  const server = createAppServer();
  server.listen(cfg.port, cfg.host, () => {
    console.log(`Ehtyajatak platform listening on http://${cfg.host}:${cfg.port} (default lang: ${cfg.defaultLanguage})`);
  });
}
