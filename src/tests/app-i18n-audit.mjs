import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { ROOT_DIR } from '../config/env.mjs';

function flattenKeys(obj, prefix = '') {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    if (k === '_meta') continue;
    const full = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...flattenKeys(v, full));
    } else {
      keys.push(full);
    }
  }
  return keys.sort();
}

const ar = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'src/i18n/ar.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'src/i18n/en.json'), 'utf8'));

const arKeys = flattenKeys(ar);
const enKeys = flattenKeys(en);

const missingInEn = arKeys.filter((k) => !enKeys.includes(k));
const missingInAr = enKeys.filter((k) => !arKeys.includes(k));

assert.equal(missingInEn.length, 0, `Missing in en.json: ${missingInEn.join(', ')}`);
assert.equal(missingInAr.length, 0, `Missing in ar.json: ${missingInAr.join(', ')}`);
assert.equal(ar._meta.verified, false);
assert.equal(en._meta.verified, false);

console.log(`Project App i18n Parity Audit: PASSED (${arKeys.length} keys across ar & en, both marked verified=false)`);
