import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { getEnvConfig, ROOT_DIR } from '../config/env.mjs';

const require = createRequire(import.meta.url);

let DatabaseSync = null;
try {
  const sqliteMod = require('node:sqlite');
  DatabaseSync = sqliteMod.DatabaseSync;
} catch (e) {
  DatabaseSync = null;
}

let _db = null;

export function getDb(customPath = null) {
  if (_db && !customPath) return _db;
  const cfg = getEnvConfig();
  if (cfg.dbDriver === 'postgresql') {
    throw new Error(
      'DB_DRIVER=postgresql is targeted for VPS deployment (run foundation/database/postgresql/001_core_schema.sql + 002_ehtyajatak_modules.sql and configure pg driver). For local development without PostgreSQL, set DB_DRIVER=sqlite.'
    );
  }
  let dbPath = customPath || cfg.sqlitePath;
  if (!customPath && (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)) {
    dbPath = path.join(os.tmpdir(), 'ehtyajatak.sqlite');
  }

  if (!DatabaseSync) {
    throw new Error('node:sqlite is not supported on this Node runtime (requires Node.js >= 22.5.0)');
  }

  try {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  } catch {
    // ignore directory creation error
  }

  let db;
  try {
    db = new DatabaseSync(dbPath);
    db.exec('PRAGMA journal_mode = WAL;');
  } catch (err) {
    console.warn(`Could not open SQLite at ${dbPath} (${err.message}). Falling back to in-memory database.`);
    db = new DatabaseSync(':memory:');
  }

  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  if (!customPath) _db = db;
  return db;
}

export function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

export function applyMigrations(db = getDb()) {
  const schemaPath = path.join(ROOT_DIR, 'src/db/sqlite-schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(sql);
}

export function withTransaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn(db);
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore rollback failure
    }
    throw err;
  }
}

export function queryOne(db, sql, ...params) {
  return db.prepare(sql).get(...params) ?? null;
}

export function queryAll(db, sql, ...params) {
  return db.prepare(sql).all(...params);
}

export function runSql(db, sql, ...params) {
  return db.prepare(sql).run(...params);
}
