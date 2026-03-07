import redisClient, { isRedisConnected } from './redis.js';

/**
 * Get a cached value by key. Returns null on miss or if Redis is unavailable.
 */
export const cacheGet = async (key) => {
  if (!isRedisConnected()) return null;
  try {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
};

/**
 * Set a cached value with TTL (seconds).
 */
export const cacheSet = async (key, value, ttlSeconds = 300) => {
  if (!isRedisConnected()) return;
  try {
    await redisClient.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    // Silently fail — app continues without cache
  }
};

/**
 * Delete a cached key.
 */
export const cacheDelete = async (key) => {
  if (!isRedisConnected()) return;
  try {
    await redisClient.del(key);
  } catch {
    // noop
  }
};

/**
 * Delete all keys matching a pattern (e.g. "analytics:*").
 * Uses SCAN to avoid blocking Redis.
 */
export const cacheClear = async (pattern) => {
  if (!isRedisConnected()) return;
  try {
    const stream = redisClient.scanStream({ match: pattern, count: 100 });
    const pipeline = redisClient.pipeline();
    let count = 0;

    for await (const keys of stream) {
      for (const key of keys) {
        pipeline.del(key);
        count++;
      }
    }

    if (count > 0) await pipeline.exec();
  } catch {
    // noop
  }
};
