import { handleAppRequest } from '../src/server.mjs';
import { getDb } from '../src/db/client.mjs';
import { seedDatabase } from '../src/db/seed.mjs';

let dbInstance = null;
let isInitialized = false;

function getInitializedDb() {
  if (!dbInstance) {
    dbInstance = getDb();
  }
  if (!isInitialized) {
    try {
      seedDatabase(dbInstance);
    } catch (err) {
      console.warn('Database seed note:', err.message);
    }
    isInitialized = true;
  }
  return dbInstance;
}

export default async function handler(req, res) {
  try {
    const db = getInitializedDb();
    await handleAppRequest(req, res, { db });
  } catch (err) {
    console.error('Vercel serverless error:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>خطأ في الخادم</title><link rel="stylesheet" href="/foundation/design-system/tokens.css"><link rel="stylesheet" href="/foundation/design-system/base.css"><link rel="stylesheet" href="/foundation/design-system/components.css"><link rel="stylesheet" href="/css/theme.css"></head><body><main class="auth-page"><div class="card stack"><h1>حدث خطأ في الخادم</h1><p>جاري تحديث النظام، يرجى إعادة المحاولة بعد لحظات.</p></div></main></body></html>`);
    }
  }
}
