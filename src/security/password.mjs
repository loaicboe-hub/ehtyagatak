import crypto from 'node:crypto';
import { validatePasswordStrength } from '../../foundation/security/token-utils.mjs';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P
  }).toString('hex');
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derived}`;
}

export function verifyPassword(password, storedHash) {
  if (typeof storedHash !== 'string' || !storedHash.startsWith('scrypt$')) return false;
  const parts = storedHash.split('$');
  if (parts.length !== 6) return false;
  const n = Number.parseInt(parts[1], 10);
  const r = Number.parseInt(parts[2], 10);
  const p = Number.parseInt(parts[3], 10);
  const salt = parts[4];
  const expectedHex = parts[5];
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p) || !salt || !expectedHex) {
    return false;
  }
  try {
    const derived = crypto.scryptSync(String(password), salt, expectedHex.length / 2, { N: n, r, p });
    const expected = Buffer.from(expectedHex, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export { validatePasswordStrength };
