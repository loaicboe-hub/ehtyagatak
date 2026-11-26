import { handleAppRequest } from '../src/server.mjs';
import { getDb } from '../src/db/client.mjs';
import { seedDatabase } from '../src/db/seed.mjs';

let dbInstance = null;
let dbInitialized = false;

function getSafeDb() {
  if (!dbInstance) {
    try {
      dbInstance = getDb();
    } catch (err) {
      console.error('getDb error:', err);
      return null;
    }
  }
  if (!dbInitialized && dbInstance) {
    try {
      seedDatabase(dbInstance);
    } catch (err) {
      console.warn('seedDatabase warning:', err.message);
    }
    dbInitialized = true;
  }
  return dbInstance;
}

export default async function handler(req, res) {
  try {
    const rawPath = req.headers['x-matched-path'] || req.url || '';
    if (rawPath === '/api/debug' || req.url === '/api/debug') {
      const activeDb = getSafeDb();
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({
        status: 'ok',
        nodeVersion: process.version,
        platform: process.platform,
        hasDb: Boolean(activeDb),
        isVercel: Boolean(process.env.VERCEL)
      }, null, 2));
    }

    const activeDb = getSafeDb();
    await handleAppRequest(req, res, { db: activeDb });
  } catch (err) {
    console.error('Vercel handler error:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(`<h1>500 - Application Error</h1><p>${err.message}</p>`);
    }
  }
}
