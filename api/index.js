export default async function handler(req, res) {
  try {
    const rawPath = req.headers['x-matched-path'] || req.url || '';
    if (rawPath === '/api/debug' || req.url === '/api/debug') {
      let sqliteLoaded = false;
      let sqliteError = null;
      try {
        const sqlite = await import('node:sqlite');
        sqliteLoaded = Boolean(sqlite && sqlite.DatabaseSync);
      } catch (e) {
        sqliteError = e.message;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        sqliteLoaded,
        sqliteError,
        envVercel: process.env.VERCEL || null
      }, null, 2));
    }

    const { handleAppRequest } = await import('../src/server.mjs');
    const { getDb } = await import('../src/db/client.mjs');
    const { seedDatabase } = await import('../src/db/seed.mjs');

    let db;
    try {
      db = getDb();
      seedDatabase(db);
    } catch (dbErr) {
      console.error('DB init warning:', dbErr);
    }

    await handleAppRequest(req, res, { db });
  } catch (err) {
    console.error('Vercel serverless error:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(`<h1>Deployment Error</h1><p><b>${err.message}</b></p><pre>${err.stack}</pre>`);
    }
  }
}
