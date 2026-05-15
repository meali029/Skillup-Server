import { Queue } from 'bullmq';
import { isRedisConnected } from './redis.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const defaultOpts = {
  connection: { url: REDIS_URL },
  defaultJobOptions: {
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
  },
};

// ── Lazy-created queue singletons ───────────────────────────────────────
// Queues are only instantiated on first use AND only when Redis is up,
// preventing ioredis from spamming ECONNREFUSED errors at import time.
let _emailQueue = null;
let _ocrQueue   = null;

export const getEmailQueue = () => {
  if (!isRedisConnected()) return null;
  if (!_emailQueue) {
    _emailQueue = new Queue('email-queue', defaultOpts);
    _emailQueue.on('error', () => {});
  }
  return _emailQueue;
};

export const getOcrQueue = () => {
  if (!isRedisConnected()) return null;
  if (!_ocrQueue) {
    _ocrQueue = new Queue('ocr-queue', {
      ...defaultOpts,
      defaultJobOptions: {
        ...defaultOpts.defaultJobOptions,
        attempts: 2,
        backoff: { type: 'exponential', delay: 10000 },
      },
    });
    _ocrQueue.on('error', () => {});
  }
  return _ocrQueue;
};

// ── Helper ──────────────────────────────────────────────────────────────
/**
 * Add a job to a queue. Returns the Job instance or null if Redis is down.
 */
export const addJob = async (queue, name, data, opts = {}) => {
  if (!queue) return null;
  try {
    return await queue.add(name, data, opts);
  } catch (err) {
    console.error(`[Queue] Failed to enqueue ${name}:`, err.message);
    return null;
  }
};
