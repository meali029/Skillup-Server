/**
 * AI Rate Limiting Middleware
 * Enforces per-user and global rate limits on AI feature routes
 */

import rateLimiterService from '../../services/ai/rate-limiter.service.js';
import { AIRateLimitError } from '../errors/ai.errors.js';

/**
 * Map feature names from route context
 */
const FEATURE_MAP = {
  'proposal': 'proposalGeneration',
  'proposalGeneration': 'proposalGeneration',
  'match': 'matchCalculation',
  'matchCalculation': 'matchCalculation',
  'recommendation': 'matchCalculation', // Recommendations use match calculation limit
  'jobRecommendation': 'matchCalculation',
  'freelancerRecommendation': 'matchCalculation',
};

/**
 * AI Rate Limiting Middleware
 * @param {string} feature - Feature name ('proposal' or 'match' or 'recommendation')
 * @param {Object} options - Options
 * @param {boolean} options.skipAdmin - Skip rate limiting for admin users (default: false)
 * @returns {Function} Express middleware
 */
export const aiRateLimit = (feature, options = {}) => {
  const { skipAdmin = false } = options;
  const featureName = FEATURE_MAP[feature] || feature;

  return async (req, res, next) => {
    try {
      // Skip rate limiting for admin users if option is set
      if (skipAdmin && req.user?.role === 'admin') {
        return next();
      }

      const userId = req.user?.id || req.user?._id;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required for AI features',
        });
      }

      // Check global rate limit first
      const globalCheck = rateLimiterService.checkGlobalLimit();
      if (!globalCheck.allowed) {
        const retryAfter = Math.ceil((globalCheck.resetAt.getTime() - Date.now()) / 1000);
        
        res.set({
          'X-RateLimit-Limit': globalCheck.limit.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': Math.ceil(globalCheck.resetAt.getTime() / 1000).toString(),
          'Retry-After': retryAfter.toString(),
        });

        return res.status(429).json({
          success: false,
          message: 'AI service rate limit exceeded. Please try again later.',
          retryAfter,
          resetAt: globalCheck.resetAt,
        });
      }

      // Check per-user rate limit
      const userCheck = rateLimiterService.checkUserLimit(userId, featureName);
      if (!userCheck.allowed) {
        const retryAfter = Math.ceil((userCheck.resetAt.getTime() - Date.now()) / 1000);
        
        res.set({
          'X-RateLimit-Limit': userCheck.limit.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': Math.ceil(userCheck.resetAt.getTime() / 1000).toString(),
          'Retry-After': retryAfter.toString(),
        });

        return res.status(429).json({
          success: false,
          message: `Rate limit exceeded for ${feature}. You have used ${userCheck.current} of ${userCheck.limit} requests this hour. Please try again later.`,
          retryAfter,
          resetAt: userCheck.resetAt,
          limit: userCheck.limit,
          current: userCheck.current,
        });
      }

      // Set rate limit headers
      res.set({
        'X-RateLimit-Limit': userCheck.limit.toString(),
        'X-RateLimit-Remaining': userCheck.remaining.toString(),
        'X-RateLimit-Reset': Math.ceil(userCheck.resetAt.getTime() / 1000).toString(),
      });

      // Attach rate limit info to request for logging
      req.rateLimitInfo = {
        user: userCheck,
        global: globalCheck,
        feature: featureName,
      };

      // Store increment function for after response
      const incrementRateLimit = () => {
        rateLimiterService.incrementUserCount(userId, featureName);
        rateLimiterService.incrementGlobalCount();
      };

      // Intercept response to increment on success
      const originalJson = res.json.bind(res);
      res.json = function(data) {
        // Only increment on successful responses (2xx status codes)
        if (res.statusCode >= 200 && res.statusCode < 300) {
          incrementRateLimit();
        }
        return originalJson(data);
      };

      next();
    } catch (error) {
      console.error('[AI Rate Limit Middleware] Error:', error);
      // On error, allow request but log it
      next();
    }
  };
};


export default aiRateLimit;

