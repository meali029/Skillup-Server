import rateLimit from 'express-rate-limit';
import { createAppError } from '../errors/index.js';

/**
 * Payment Rate Limiting Middleware
 * Protects payment endpoints from abuse
 */

// Rate limit for deposit initialization (5 per hour)
export const depositRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
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
  message: 'Too many verification attempts. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limit for general payment endpoints (20 per hour)
export const paymentRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: 'Too many payment requests. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

