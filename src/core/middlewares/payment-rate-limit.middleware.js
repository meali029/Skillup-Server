import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import redisClient, { isRedisConnected } from '../../config/redis.js';
import { createAppError } from '../errors/index.js';

/**
 * Payment Rate Limiting Middleware
 * Uses Redis store when available, falls back to in-memory.
 */

const makeStore = (prefix) => {
  if (!isRedisConnected()) return undefined; // default in-memory
  return new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
    prefix: `rl:${prefix}:`,
  });
};

// Rate limit for deposit initialization (5 per hour)
export const depositRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  store: makeStore('deposit'),
  message: 'Too many deposit attempts. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many deposit attempts. Please try again later.',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000),
    });
  },
});

// Rate limit for withdrawal requests (3 per hour)
export const withdrawalRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  store: makeStore('withdrawal'),
  message: 'Too many withdrawal requests. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many withdrawal requests. Please try again later.',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000),
    });
  },
});

// Rate limit for payment verification (10 per hour)
export const paymentVerificationRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  store: makeStore('pv'),
  message: 'Too many verification attempts. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limit for general payment endpoints (100 per hour)
// This covers read-only operations like getting wallet balance
export const paymentRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100,
  store: makeStore('pay'),
  message: 'Too many payment requests. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

