/**
 * Rate Limiter Service
 * Tracks and enforces per-user and global rate limits for AI features.
 * Uses Redis when available (shared across instances), falls back to in-memory Map.
 */

import aiConfig from '../../config/ai.config.js';
import redisClient, { isRedisConnected } from '../../config/redis.js';
import { JOB_INTERVALS } from '../../workers/jobSchedules.js';

const HOUR_SECONDS = 3600;

// ── Redis-backed helpers ────────────────────────────────────────────────

const redisUserKey = (userId, feature) => `ai:rl:user:${userId}:${feature}`;
const redisGlobalKey = () => 'ai:rl:global';

/**
 * Atomically increment a Redis counter and set TTL if it's the first increment.
 * Returns { count, ttl }.
 */
const redisIncr = async (key, ttlSeconds = HOUR_SECONDS) => {
  const count = await redisClient.incr(key);
  if (count === 1) {
    await redisClient.expire(key, ttlSeconds);
  }
  const ttl = await redisClient.ttl(key);
  return { count, ttl };
};

const redisGetCount = async (key) => {
  const val = await redisClient.get(key);
  const ttl = await redisClient.ttl(key);
  return { count: val ? parseInt(val, 10) : 0, ttl: ttl > 0 ? ttl : HOUR_SECONDS };
};

/**
 * User rate limit entry structure
 */
class UserRateLimitEntry {
  constructor() {
    this.counts = {
      proposalGeneration: 0,
      matchCalculation: 0,
    };
    this.windowStart = Date.now();
  }

  resetIfNeeded() {
    const now = Date.now();
    const hourInMs = 60 * 60 * 1000;
    
    // Reset if an hour has passed
    if (now - this.windowStart >= hourInMs) {
      this.counts.proposalGeneration = 0;
      this.counts.matchCalculation = 0;
      this.windowStart = now;
      return true;
    }
    return false;
  }

  getRemainingTime() {
    const now = Date.now();
    const hourInMs = 60 * 60 * 1000;
    const elapsed = now - this.windowStart;
    return Math.max(0, hourInMs - elapsed);
  }
}

/**
 * Global rate limit tracker
 */
class GlobalRateLimitTracker {
  constructor() {
    this.count = 0;
    this.windowStart = Date.now();
  }

  resetIfNeeded() {
    const now = Date.now();
    const hourInMs = 60 * 60 * 1000;
    
    if (now - this.windowStart >= hourInMs) {
      this.count = 0;
      this.windowStart = now;
      return true;
    }
    return false;
  }

  getRemainingTime() {
    const now = Date.now();
    const hourInMs = 60 * 60 * 1000;
    const elapsed = now - this.windowStart;
    return Math.max(0, hourInMs - elapsed);
  }
}

/**
 * Rate Limiter Service Class
 * Uses Redis when connected; falls back to in-memory Map for dev/local.
 */
class RateLimiterService {
  constructor() {
    // In-memory fallback
    this.userLimits = new Map();
    this.globalLimit = new GlobalRateLimitTracker();

    this.cleanupInterval = setInterval(() => this.cleanup(), JOB_INTERVALS.aiRateLimitCleanupMs);
    this.stats = { totalChecks: 0, blockedRequests: 0, userLimitHits: 0, globalLimitHits: 0 };
  }

  // ── helpers ─────────────────────────────────────────────────────────

  _useRedis() { return isRedisConnected(); }

  getUserEntry(userId) {
    if (!this.userLimits.has(userId)) this.userLimits.set(userId, new UserRateLimitEntry());
    return this.userLimits.get(userId);
  }

  // ── per-user check ──────────────────────────────────────────────────

  async checkUserLimit(userId, feature) {
    this.stats.totalChecks++;
    if (!userId) return { allowed: false, remaining: 0, resetAt: null, limit: 0, reason: 'User ID required' };

    const limit = aiConfig.rateLimit.perUser[feature] || 0;

    if (this._useRedis()) {
      const { count, ttl } = await redisGetCount(redisUserKey(userId, feature));
      const remaining = Math.max(0, limit - count);
      const allowed = count < limit;
      if (!allowed) { this.stats.blockedRequests++; this.stats.userLimitHits++; }
      return { allowed, remaining, resetAt: new Date(Date.now() + ttl * 1000), limit, current: count };
    }

    // In-memory fallback
    const entry = this.getUserEntry(userId);
    entry.resetIfNeeded();
    const currentCount = entry.counts[feature] || 0;
    const remaining = Math.max(0, limit - currentCount);
    const allowed = currentCount < limit;
    if (!allowed) { this.stats.blockedRequests++; this.stats.userLimitHits++; }
    return { allowed, remaining, resetAt: new Date(entry.windowStart + 60 * 60 * 1000), limit, current: currentCount };
  }

  // ── per-user increment ──────────────────────────────────────────────

  async incrementUserCount(userId, feature) {
    if (!userId) return;
    if (this._useRedis()) {
      await redisIncr(redisUserKey(userId, feature));
      return;
    }
    const entry = this.getUserEntry(userId);
    entry.resetIfNeeded();
    if (entry.counts[feature] !== undefined) entry.counts[feature]++;
  }

  // ── global check ────────────────────────────────────────────────────

  async checkGlobalLimit() {
    const limit = aiConfig.rateLimit.global.maxRequests || 1000;

    if (this._useRedis()) {
      const { count, ttl } = await redisGetCount(redisGlobalKey());
      const remaining = Math.max(0, limit - count);
      const allowed = count < limit;
      if (!allowed) { this.stats.blockedRequests++; this.stats.globalLimitHits++; }
      return { allowed, remaining, resetAt: new Date(Date.now() + ttl * 1000), limit, current: count };
    }

    this.globalLimit.resetIfNeeded();
    const currentCount = this.globalLimit.count;
    const remaining = Math.max(0, limit - currentCount);
    const allowed = currentCount < limit;
    if (!allowed) { this.stats.blockedRequests++; this.stats.globalLimitHits++; }
    return { allowed, remaining, resetAt: new Date(this.globalLimit.windowStart + 60 * 60 * 1000), limit, current: currentCount };
  }

  // ── global increment ────────────────────────────────────────────────

  async incrementGlobalCount() {
    if (this._useRedis()) {
      await redisIncr(redisGlobalKey());
      return;
    }
    this.globalLimit.resetIfNeeded();
    this.globalLimit.count++;
  }

  // ── stats ──────────────────────────────────────────────────────────

  async getUserStats(userId) {
    const defaultStats = (feature) => ({ current: 0, limit: aiConfig.rateLimit.perUser[feature], remaining: aiConfig.rateLimit.perUser[feature] });
    if (!userId) return { proposalGeneration: defaultStats('proposalGeneration'), matchCalculation: defaultStats('matchCalculation') };

    const features = ['proposalGeneration', 'matchCalculation'];
    const result = {};
    for (const f of features) {
      if (this._useRedis()) {
        const { count, ttl } = await redisGetCount(redisUserKey(userId, f));
        const limit = aiConfig.rateLimit.perUser[f];
        result[f] = { current: count, limit, remaining: Math.max(0, limit - count), resetAt: new Date(Date.now() + ttl * 1000) };
      } else {
        const entry = this.getUserEntry(userId);
        entry.resetIfNeeded();
        const limit = aiConfig.rateLimit.perUser[f];
        result[f] = { current: entry.counts[f], limit, remaining: Math.max(0, limit - entry.counts[f]), resetAt: new Date(entry.windowStart + 60 * 60 * 1000) };
      }
    }
    return result;
  }

  async getGlobalStats() {
    const limit = aiConfig.rateLimit.global.maxRequests;
    if (this._useRedis()) {
      const { count, ttl } = await redisGetCount(redisGlobalKey());
      return { current: count, limit, remaining: Math.max(0, limit - count), resetAt: new Date(Date.now() + ttl * 1000) };
    }
    this.globalLimit.resetIfNeeded();
    return { current: this.globalLimit.count, limit, remaining: Math.max(0, limit - this.globalLimit.count), resetAt: new Date(this.globalLimit.windowStart + 60 * 60 * 1000) };
  }

  // ── admin resets ────────────────────────────────────────────────────

  async resetUserLimits(userId) {
    if (this._useRedis()) {
      const keys = await redisClient.keys(`ai:rl:user:${userId || '*'}:*`);
      if (keys.length) await redisClient.del(...keys);
    }
    if (userId) this.userLimits.delete(userId);
    else this.userLimits.clear();
  }

  async resetGlobalLimits() {
    if (this._useRedis()) await redisClient.del(redisGlobalKey());
    this.globalLimit.count = 0;
    this.globalLimit.windowStart = Date.now();
  }

  getStats() {
    return { ...this.stats, activeUsers: this.userLimits.size };
  }

  cleanup() {
    const now = Date.now();
    const twoHours = 2 * 60 * 60 * 1000;
    for (const [userId, entry] of this.userLimits.entries()) {
      if (now - entry.windowStart >= twoHours) this.userLimits.delete(userId);
    }
  }

  stop() {
    if (this.cleanupInterval) { clearInterval(this.cleanupInterval); this.cleanupInterval = null; }
  }
}

// Export singleton instance
export default new RateLimiterService();
