import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let connected = false;

// ── Client factory ──────────────────────────────────────────────────────
const makeClient = () => {
  const client = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,       // Required by BullMQ
    enableReadyCheck: true,
    lazyConnect: true,                // Don't connect until .connect() is called
    enableOfflineQueue: false,        // Don't buffer commands while disconnected
    retryStrategy(times) {
      if (!connected) return null;    // Never connected → fail fast
      if (times > 10) return null;    // Give up after 10 reconnect attempts
      return Math.min(times * 200, 5000);
    },
    reconnectOnError() { return false; },
  });
  // Silently swallow all error events so Node doesn't print stack traces
  client.on('error', () => {});
  return client;
};

// Clients are created lazily in connectRedis().
// The `let` bindings are live ES-module exports — importers always see
// the current value.
let redisClient = makeClient();
let redisPub    = makeClient();
let redisSub    = makeClient();

// ── Connect ─────────────────────────────────────────────────────────────
export const connectRedis = async () => {
  if (connected) return;
  try {
    // Connect sequentially so the first failure skips the rest
    await redisClient.connect();
    await redisPub.connect();
    await redisSub.connect();
    connected = true;
    console.log('[Redis] All clients connected');
  } catch {
    connected = false;
    console.warn('[Redis] Not available — falling back to in-memory stores');
    // Force-kill every client to stop any lingering socket retries
    for (const c of [redisClient, redisPub, redisSub]) {
      try { c.disconnect(false); } catch { /* ignore */ }
      c.removeAllListeners();
      c.on('error', () => {});  // re-attach no-op so Node never throws
    }
  }
};

// ── Graceful shutdown ───────────────────────────────────────────────────
export const disconnectRedis = async () => {
  for (const c of [redisClient, redisPub, redisSub]) {
    try { await c.quit(); } catch { /* already closed */ }
  }
  connected = false;
  console.log('[Redis] All clients disconnected');
};

export const isRedisConnected = () => connected && redisClient.status === 'ready';

export { redisClient, redisPub, redisSub };
export default redisClient;
