import dotenv from 'dotenv';
import { join } from 'path';

const baseDir = process.cwd();

// Load environment variables
dotenv.config({ path: join(baseDir, '.env') });

/**
 * AI Configuration
 * Centralized configuration for AI services
 */
const aiConfig = {
  // Feature flags
  enabled: process.env.AI_ENABLED === 'true',
  cacheEnabled: process.env.AI_CACHE_ENABLED !== 'false', // Default true
  cacheTTL: parseInt(process.env.AI_CACHE_TTL) || 3600, // 1 hour default

  // Provider selection
  provider: process.env.AI_PROVIDER || 'gemini', // gemini | openai

  // Gemini configuration
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-pro',
    maxTokens: parseInt(process.env.GEMINI_MAX_TOKENS) || 1000,
    temperature: parseFloat(process.env.GEMINI_TEMPERATURE) || 0.7,
    timeout: parseInt(process.env.GEMINI_TIMEOUT) || 30000, // 30 seconds
  },

  // Rate limiting
  rateLimit: {
    perUser: {
      proposalGeneration: parseInt(process.env.AI_RATE_LIMIT_PROPOSAL) || 10, // per hour
      matchCalculation: parseInt(process.env.AI_RATE_LIMIT_MATCH) || 50, // per hour
    },
    global: {
      maxRequests: parseInt(process.env.AI_RATE_LIMIT_GLOBAL) || 1000, // per hour
    },
  },

  // Circuit breaker
  circuitBreaker: {
    errorThreshold: parseFloat(process.env.AI_CB_ERROR_THRESHOLD) || 0.1, // 10%
    timeWindow: parseInt(process.env.AI_CB_TIME_WINDOW) || 300000, // 5 minutes
    recoveryTime: parseInt(process.env.AI_CB_RECOVERY_TIME) || 300000, // 5 minutes
  },

  // Feature-specific flags (can be overridden by admin settings)
  features: {
    jobRecommendations: process.env.AI_FEATURE_JOB_RECOMMENDATIONS !== 'false',
    freelancerRecommendations: process.env.AI_FEATURE_FREELANCER_RECOMMENDATIONS !== 'false',
    proposalGeneration: process.env.AI_FEATURE_PROPOSAL_GENERATION !== 'false',
    matchScoreEnhancement: process.env.AI_FEATURE_MATCH_SCORE !== 'false',
  },
};

/**
 * Validate AI configuration
 */
export const validateAIConfig = () => {
  if (aiConfig.enabled && aiConfig.provider === 'gemini') {
    if (!aiConfig.gemini.apiKey) {
      console.warn('⚠️  GEMINI_API_KEY not set. AI features will be disabled.');
      return false;
    }
  }
  return true;
};

/**
 * Check if AI is enabled and configured
 */
export const isAIEnabled = () => {
  return aiConfig.enabled && validateAIConfig();
};

export default aiConfig;




