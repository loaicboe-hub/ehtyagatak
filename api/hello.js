import { createRequire } from 'node:module';

const reqMod = createRequire(import.meta.url);

export default function handler(req, res) {
  let hasSqlite = false;
  let sqliteErr = null;
  try {
    const s = reqMod('node:sqlite');
    hasSqlite = Boolean(s && s.DatabaseSync);
  } catch (e) {
    sqliteErr = e.message;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({
    ok: true,
    nodeVersion: process.version,
    hasSqlite,
    sqliteErr,
    envVercel: process.env.VERCEL || null
  }, null, 2));
}
