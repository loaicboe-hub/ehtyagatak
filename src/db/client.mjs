import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { getEnvConfig, ROOT_DIR } from '../config/env.mjs';

let _db = null;

export function getDb(customPath = null) {
  if (_db && !customPath) return _db;
  const cfg = getEnvConfig();
  if (cfg.dbDriver === 'postgresql') {
    throw new Error(
      'DB_DRIVER=postgresql is targeted for VPS deployment (run foundation/database/postgresql/001_core_schema.sql + 002_ehtyajatak_modules.sql and configure pg driver). For local development without PostgreSQL, set DB_DRIVER=sqlite.'
    );
  }
  const dbPath = customPath || cfg.sqlitePath;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
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
