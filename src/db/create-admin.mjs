import crypto from 'node:crypto';
import { getDb, closeDb, queryOne, runSql } from './client.mjs';
import { seedDatabase } from './seed.mjs';
import { validatePasswordStrength } from '../../foundation/security/token-utils.mjs';

function hashPasswordScrypt(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return `scrypt$16384$8$1$${salt}$${derived}`;
}

const email = (process.env.ADMIN_EMAIL || process.argv[2] || '').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || process.argv[3] || '';
const fullName = process.env.ADMIN_NAME || process.argv[4] || 'System Administrator';

if (!email || !password) {
  console.error('Usage: node src/db/create-admin.mjs <email> <strong-password> [fullName]');
  console.error('Or set ADMIN_EMAIL and ADMIN_PASSWORD environment variables.');
  process.exit(1);
}

const check = validatePasswordStrength(password, { minLength: 10 });
if (!check.valid) {
  console.error('Password does not meet security policy:', check.issues.join(', '));
  process.exit(1);
}

const db = getDb();
seedDatabase(db);

const role = queryOne(db, "SELECT id FROM roles WHERE slug = 'super_admin'");
const existing = queryOne(db, 'SELECT id FROM users WHERE email = ?', email);
const pwHash = hashPasswordScrypt(password);

if (existing) {
  runSql(db, 'UPDATE users SET full_name = ?, password_hash = ?, role_id = ?, is_active = 1 WHERE id = ?', fullName, pwHash, role.id, existing.id);
  console.log(`Updated super_admin account: ${email}`);
} else {
  runSql(
    db,
    `INSERT INTO users (full_name, email, password_hash, role_id, preferred_language, is_active, email_verified_at)
     VALUES (?, ?, ?, ?, 'ar', 1, datetime('now'))`,
    fullName,
    email,
    pwHash,
    role.id
  );
  console.log(`Created super_admin account: ${email}`);
}

closeDb();
