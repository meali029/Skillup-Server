/**
 * Rate Limiter Service
 * Tracks and enforces per-user and global rate limits for AI features
 */

import aiConfig from '../../config/ai.config.js';

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
 */
class RateLimiterService {
  constructor() {
    // Per-user rate limit tracking
    this.userLimits = new Map();
    
    // Global rate limit tracking
    this.globalLimit = new GlobalRateLimitTracker();
    
    // Cleanup interval (every 5 minutes)
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
    
    // Stats
    this.stats = {
      totalChecks: 0,
      blockedRequests: 0,
      userLimitHits: 0,
      globalLimitHits: 0,
    };
  }

  /**
   * Get or create user rate limit entry
   */
  getUserEntry(userId) {
    if (!this.userLimits.has(userId)) {
      this.userLimits.set(userId, new UserRateLimitEntry());
    }
    return this.userLimits.get(userId);
  }

  /**
   * Check if user can make a request for a specific feature
   * @param {string} userId - User ID
   * @param {string} feature - Feature name ('proposalGeneration' or 'matchCalculation')
   * @returns {Object} { allowed: boolean, remaining: number, resetAt: Date, limit: number }
   */
  checkUserLimit(userId, feature) {
    this.stats.totalChecks++;
    
    if (!userId) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: null,
        limit: 0,
        reason: 'User ID required',
      };
    }

    const entry = this.getUserEntry(userId);
    entry.resetIfNeeded();

    const limit = aiConfig.rateLimit.perUser[feature] || 0;
    const currentCount = entry.counts[feature] || 0;
    const remaining = Math.max(0, limit - currentCount);
    const allowed = currentCount < limit;
    
    const resetAt = new Date(entry.windowStart + 60 * 60 * 1000);

    if (!allowed) {
      this.stats.blockedRequests++;
      this.stats.userLimitHits++;
    }

    return {
      allowed,
      remaining,
      resetAt: new Date(entry.windowStart + 60 * 60 * 1000),
      limit,
      current: currentCount,
    };
  }

  /**
   * Increment user request count
   * @param {string} userId - User ID
   * @param {string} feature - Feature name
   */
  incrementUserCount(userId, feature) {
    if (!userId) return;

    const entry = this.getUserEntry(userId);
    entry.resetIfNeeded();
    
    if (entry.counts[feature] !== undefined) {
      entry.counts[feature]++;
    }
  }

  /**
   * Check global rate limit
   * @returns {Object} { allowed: boolean, remaining: number, resetAt: Date, limit: number }
   */
  checkGlobalLimit() {
    this.globalLimit.resetIfNeeded();
    
    const limit = aiConfig.rateLimit.global.maxRequests || 1000;
    const currentCount = this.globalLimit.count;
    const remaining = Math.max(0, limit - currentCount);
    const allowed = currentCount < limit;
    
    const resetAt = new Date(this.globalLimit.windowStart + 60 * 60 * 1000);

    if (!allowed) {
      this.stats.blockedRequests++;
      this.stats.globalLimitHits++;
    }

    return {
      allowed,
      remaining,
      resetAt,
      limit,
      current: currentCount,
    };
  }

  /**
   * Increment global request count
   */
  incrementGlobalCount() {
    this.globalLimit.resetIfNeeded();
    this.globalLimit.count++;
  }

  /**
   * Get user statistics
   * @param {string} userId - User ID
   * @returns {Object} User rate limit stats
   */
  getUserStats(userId) {
    if (!userId || !this.userLimits.has(userId)) {
      return {
        proposalGeneration: { current: 0, limit: 0, remaining: 0 },
        matchCalculation: { current: 0, limit: 0, remaining: 0 },
      };
    }

    const entry = this.getUserEntry(userId);
    entry.resetIfNeeded();

    return {
      proposalGeneration: {
        current: entry.counts.proposalGeneration,
        limit: aiConfig.rateLimit.perUser.proposalGeneration,
        remaining: Math.max(0, aiConfig.rateLimit.perUser.proposalGeneration - entry.counts.proposalGeneration),
        resetAt: new Date(entry.windowStart + 60 * 60 * 1000),
      },
      matchCalculation: {
        current: entry.counts.matchCalculation,
        limit: aiConfig.rateLimit.perUser.matchCalculation,
        remaining: Math.max(0, aiConfig.rateLimit.perUser.matchCalculation - entry.counts.matchCalculation),
        resetAt: new Date(entry.windowStart + 60 * 60 * 1000),
      },
    };
  }

  /**
   * Get global statistics
   * @returns {Object} Global rate limit stats
   */
  getGlobalStats() {
    this.globalLimit.resetIfNeeded();
    
    return {
      current: this.globalLimit.count,
      limit: aiConfig.rateLimit.global.maxRequests,
      remaining: Math.max(0, aiConfig.rateLimit.global.maxRequests - this.globalLimit.count),
      resetAt: new Date(this.globalLimit.windowStart + 60 * 60 * 1000),
    };
  }

  /**
   * Reset user limits (admin function)
   * @param {string} userId - User ID
   */
  resetUserLimits(userId) {
    if (userId) {
      this.userLimits.delete(userId);
    } else {
      this.userLimits.clear();
    }
  }

  /**
   * Reset global limits (admin function)
   */
  resetGlobalLimits() {
    this.globalLimit.count = 0;
    this.globalLimit.windowStart = Date.now();
  }

  /**
   * Get service statistics
   * @returns {Object} Service stats
   */
  getStats() {
    return {
      ...this.stats,
      activeUsers: this.userLimits.size,
      global: this.getGlobalStats(),
    };
  }

  /**
   * Cleanup expired entries (called periodically)
   */
  cleanup() {
    const now = Date.now();
    const hourInMs = 60 * 60 * 1000;
    let cleaned = 0;

    for (const [userId, entry] of this.userLimits.entries()) {
      // Remove entries that haven't been used in 2 hours
      if (now - entry.windowStart >= 2 * hourInMs) {
        this.userLimits.delete(userId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[Rate Limiter] Cleaned up ${cleaned} expired user entries`);
    }
  }

  /**
   * Stop cleanup interval (for testing)
   */
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Export singleton instance
export default new RateLimiterService();

