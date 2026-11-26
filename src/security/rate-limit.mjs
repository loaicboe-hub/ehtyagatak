import { DEFAULT_RATE_LIMIT_TIERS, createRateLimiter } from '../../foundation/security/rate-limiter.mjs';

export const APP_RATE_LIMIT_TIERS = {
  ...DEFAULT_RATE_LIMIT_TIERS,
  erpSync: { maxAttempts: 60, windowSeconds: 60, lockoutSeconds: 60 }
};

export class SqliteRateLimitStore {
  constructor(db) {
    this.db = db;
  }

  async consume(key, maxAttempts, windowSeconds, lockoutSeconds) {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const existing = this.db.prepare('SELECT * FROM rate_limit_buckets WHERE bucket_key = ?').get(key);

    if (existing?.blocked_until && existing.blocked_until > nowIso) {
      const retryMs = Math.max(1000, Date.parse(existing.blocked_until) - nowMs);
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.ceil(retryMs / 1000),
        resetAt: existing.blocked_until
      };
    }

    if (!existing || existing.window_reset_at <= nowIso) {
      const windowResetAt = new Date(nowMs + windowSeconds * 1000).toISOString();
      this.db.prepare(`
        INSERT INTO rate_limit_buckets (bucket_key, hit_count, window_reset_at, blocked_until, updated_at)
        VALUES (?, 1, ?, NULL, ?)
        ON CONFLICT(bucket_key) DO UPDATE SET
          hit_count = 1,
          window_reset_at = excluded.window_reset_at,
          blocked_until = NULL,
          updated_at = excluded.updated_at
      `).run(key, windowResetAt, nowIso);
      return {
        allowed: true,
        remaining: Math.max(0, maxAttempts - 1),
        retryAfterSeconds: 0,
        resetAt: windowResetAt
      };
    }

    const nextCount = existing.hit_count + 1;
    if (nextCount > maxAttempts) {
      const blockedUntil = new Date(nowMs + lockoutSeconds * 1000).toISOString();
      this.db.prepare(`
        UPDATE rate_limit_buckets
        SET hit_count = ?, blocked_until = ?, updated_at = ?
        WHERE bucket_key = ?
      `).run(nextCount, blockedUntil, nowIso, key);
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: lockoutSeconds,
        resetAt: blockedUntil
      };
    }

    this.db.prepare(`
      UPDATE rate_limit_buckets
      SET hit_count = ?, updated_at = ?
      WHERE bucket_key = ?
    `).run(nextCount, nowIso, key);

    return {
      allowed: true,
      remaining: Math.max(0, maxAttempts - nextCount),
      retryAfterSeconds: 0,
      resetAt: existing.window_reset_at
    };
  }
}

export function getAppRateLimiter(db) {
  return createRateLimiter({
    store: new SqliteRateLimitStore(db),
    tiers: APP_RATE_LIMIT_TIERS
  });
}
