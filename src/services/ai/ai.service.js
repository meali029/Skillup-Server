/**
 * AI Service
 * Main orchestrator for AI operations
 * Handles provider selection, caching, error handling, and feature flags
 */

import geminiProvider from './gemini.provider.js';
import promptManager from './prompt.manager.js';
import { sanitizeUser, sanitizeJob } from './data-sanitizer.js';
import adminSettingsService from '../../modules/admin/admin.settings.service.js';
import aiConfig from '../../config/ai.config.js';
import circuitBreaker from './circuit-breaker.js';
import {
  AIProviderError,
  AIConfigurationError,
} from '../../core/errors/ai.errors.js';

// Simple in-memory cache (can be replaced with Redis later)
const cache = new Map();
const CACHE_TTL = aiConfig.cacheTTL * 1000; // Convert to milliseconds

/**
 * Generate cache key from input
 */
const generateCacheKey = (prefix, data) => {
  const dataString = JSON.stringify(data);
  return `${prefix}:${Buffer.from(dataString).toString('base64').substring(0, 50)}`;
};

/**
 * Get cached value
 */
const getCached = (key) => {
  if (!aiConfig.cacheEnabled) {
    return null;
  }

  const cached = cache.get(key);
  if (!cached) {
    return null;
  }

  // Check if expired
  if (Date.now() - cached.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }

  return cached.value;
};

/**
 * Set cached value
 */
const setCached = (key, value) => {
  if (!aiConfig.cacheEnabled) {
    return;
  }

  cache.set(key, {
    value,
    timestamp: Date.now(),
  });
};

/**
 * Get current AI provider
 */
const getProvider = async () => {
  const providerName = await adminSettingsService.getAIProvider();
  
  if (providerName === 'gemini') {
    if (!geminiProvider.isAvailable()) {
      throw AIConfigurationError('Gemini provider is not available');
    }
    return geminiProvider;
  }

  // Future: Add OpenAI provider here
  throw AIConfigurationError(`Provider ${providerName} is not implemented`);
};

/**
 * AI Service Class
 */
class AIService {
  /**
   * Enhance job match score with AI
   * @param {Object} job - Job object (will be sanitized)
   * @param {Object} freelancer - Freelancer object (will be sanitized)
   * @param {number} baseScore - Base score from rule-based matching
   * @returns {Promise<Object>} Enhanced match score
   */
  async enhanceJobMatchScore(job, freelancer, baseScore = 0) {
    // Check feature flag
    const isEnabled = await adminSettingsService.isFeatureEnabled('matchScoreEnhancement');
    if (!isEnabled) {
      return {
        baseScore,
        aiScore: baseScore,
        finalScore: baseScore,
        confidence: 0,
        reasoning: 'AI enhancement disabled',
        factors: {
          skillMatch: 0,
          experienceMatch: 0,
          budgetMatch: 0,
          semanticFit: 0,
          contextualFit: 0,
        },
      };
    }

    // Fallback function
    const fallback = () => ({
      baseScore,
      aiScore: baseScore,
      finalScore: baseScore,
      confidence: 0,
      reasoning: 'AI enhancement unavailable (circuit breaker open or error), using base score',
      factors: {
        skillMatch: baseScore * 0.4,
        experienceMatch: baseScore * 0.2,
        budgetMatch: baseScore * 0.15,
        semanticFit: 0,
        contextualFit: 0,
      },
    });

    // Execute with circuit breaker protection
    return circuitBreaker.execute(async () => {
      try {
        // Sanitize data
        const sanitizedJob = sanitizeJob(job);
        const sanitizedFreelancer = sanitizeUser(freelancer);

        // Check cache
        const cacheKey = generateCacheKey('match', {
          jobId: job._id?.toString(),
          freelancerId: freelancer._id?.toString(),
          baseScore,
        });
        const cached = getCached(cacheKey);
        if (cached) {
          console.log('[AI Service] Cache hit for match score');
          return cached;
        }

        // Get provider
        const provider = await getProvider();

        // Generate prompt
        const prompt = promptManager.generateMatchEnhancementPrompt(
          sanitizedJob,
          sanitizedFreelancer,
          baseScore
        );

        // Call AI
        const response = await provider.generateText(prompt, {
          maxTokens: 500,
          temperature: 0.5,
        });

        // Parse response
        let aiAnalysis;
        try {
          const jsonMatch = response.text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            aiAnalysis = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('No JSON found in response');
          }
        } catch (parseError) {
          // Fallback parsing
          aiAnalysis = {
            enhancedScore: baseScore,
            reasoning: response.text.substring(0, 200),
            semanticMatch: 70,
            contextualFit: 70,
          };
        }

        // Calculate final score (60% base, 40% AI)
        const aiScore = Math.min(100, Math.max(0, aiAnalysis.enhancedScore || baseScore));
        const finalScore = Math.round(baseScore * 0.6 + aiScore * 0.4);

        const result = {
          baseScore,
          aiScore,
          finalScore,
          confidence: response.confidence || 75,
          reasoning: aiAnalysis.reasoning || 'AI analysis completed',
          factors: {
            skillMatch: baseScore * 0.4,
            experienceMatch: baseScore * 0.2,
            budgetMatch: baseScore * 0.15,
            semanticFit: aiAnalysis.semanticMatch || 70,
            contextualFit: aiAnalysis.contextualFit || 70,
          },
        };

        // Cache result
        setCached(cacheKey, result);

        return result;
      } catch (error) {
        console.error('[AI Service] Error enhancing match score:', error);
        throw error; // Let circuit breaker handle it
      }
    }, fallback);
  }

  /**
   * Generate proposal draft
   * @param {Object} job - Job object
   * @param {Object} freelancer - Freelancer object
   * @returns {Promise<Object>} Proposal draft
   */
  async generateProposalDraft(job, freelancer) {
    // Check feature flag
    const isEnabled = await adminSettingsService.isFeatureEnabled('proposalGeneration');
    if (!isEnabled) {
      throw AIConfigurationError('AI proposal generation is disabled');
    }

    try {
      // Sanitize data
      const sanitizedJob = sanitizeJob(job);
      const sanitizedFreelancer = sanitizeUser(freelancer);

      // Get provider
      const provider = await getProvider();

      // Generate cover letter
      const coverLetterPrompt = promptManager.generateCoverLetterPrompt(
        sanitizedJob,
        sanitizedFreelancer
      );
      const coverLetterResponse = await provider.generateText(coverLetterPrompt, {
        maxTokens: 2000,
        temperature: 0.7,
      });

      // Generate bid amount suggestion
      const bidAmountPrompt = promptManager.generateBidAmountPrompt(
        sanitizedJob,
        sanitizedFreelancer
      );
      const bidAmountResponse = await provider.generateText(bidAmountPrompt, {
        maxTokens: 50,
        temperature: 0.3,
      });

      // Generate delivery time suggestion
      const deliveryTimePrompt = promptManager.generateDeliveryTimePrompt(
        sanitizedJob,
        sanitizedFreelancer
      );
      const deliveryTimeResponse = await provider.generateText(deliveryTimePrompt, {
        maxTokens: 50,
        temperature: 0.3,
      });

      // Parse responses
      const coverLetter = coverLetterResponse.text.trim();
      const bidAmount = this.parseNumber(bidAmountResponse.text) || job.budgetAmount || 0;
      const deliveryTime = this.parseNumber(deliveryTimeResponse.text) || 7;

      // Validate cover letter length
      if (coverLetter.length < 100) {
        throw new Error('Generated cover letter is too short');
      }
      
      const result = {
        coverLetter: coverLetter.length > 2000 ? coverLetter.substring(0, 2000) : coverLetter,
        bidAmount: Math.max(500, Math.min(10000000, bidAmount)), // Clamp to valid range
        deliveryTime: Math.max(1, Math.min(365, deliveryTime)), // Clamp to valid range
        confidence: Math.min(
          coverLetterResponse.confidence || 75,
          bidAmountResponse.confidence || 75,
          deliveryTimeResponse.confidence || 75
        ),
        generatedAt: new Date(),
      };

      return result;
    } catch (error) {
      console.error('[AI Service] Error generating proposal draft:', error);
      throw AIProviderError(`Failed to generate proposal draft: ${error.message}`);
    }
  }

  /**
   * Generate cover letter only
   */
  async generateCoverLetter(job, freelancer) {
    const draft = await this.generateProposalDraft(job, freelancer);
    return draft.coverLetter;
  }

  /**
   * Suggest bid amount
   */
  async suggestBidAmount(job, freelancer) {
    const draft = await this.generateProposalDraft(job, freelancer);
    return draft.bidAmount;
  }

  /**
   * Parse number from text
   */
  parseNumber(text) {
    const match = text.match(/\d+/);
    return match ? parseInt(match[0]) : null;
  }

  /**
   * Batch enhance match scores
   * @param {Array} matches - Array of {job, freelancer, baseScore}
   * @returns {Promise<Array>} Enhanced match scores
   */
  async batchEnhanceMatchScores(matches) {
    const isEnabled = await adminSettingsService.isFeatureEnabled('matchScoreEnhancement');
    if (!isEnabled) {
      return matches.map(m => ({
        ...m,
        aiScore: m.baseScore,
        finalScore: m.baseScore,
        confidence: 0,
      }));
    }

    // Process in batches to avoid rate limits
    const batchSize = 5;
    const results = [];

    for (let i = 0; i < matches.length; i += batchSize) {
      const batch = matches.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(match => this.enhanceJobMatchScore(match.job, match.freelancer, match.baseScore))
      );
      results.push(...batchResults);

      // Small delay between batches
      if (i + batchSize < matches.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  /**
   * Get AI service health and stats
   */
  async getHealthStatus() {
    const circuitBreakerStats = circuitBreaker.getStats();
    
    return {
      status: circuitBreakerStats.state === 'OPEN' ? 'unhealthy' : 'healthy',
      enabled: aiConfig.enabled,
      provider: aiConfig.provider,
      circuitBreaker: circuitBreakerStats,
      cache: {
        size: cache.size,
        enabled: aiConfig.cacheEnabled,
        ttl: aiConfig.cacheTTL,
      },
      features: aiConfig.features,
      rateLimit: {
        proposal: aiConfig.rateLimit.proposalGeneration,
        match: aiConfig.rateLimit.matchScoring,
        global: aiConfig.rateLimit.global,
      },
    };
  }

  /**
   * Get circuit breaker stats
   */
  getCircuitBreakerStats() {
    return circuitBreaker.getStats();
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker() {
    circuitBreaker.reset();
  }
}

export default new AIService();

