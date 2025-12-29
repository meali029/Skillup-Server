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
import rateLimiterService from './rate-limiter.service.js';
import {
  AIProviderError,
  AIConfigurationError,
} from '../../core/errors/ai.errors.js';

// Enhanced in-memory cache with LRU eviction
const cache = new Map();
const CACHE_TTL = aiConfig.cacheTTL * 1000; // Convert to milliseconds
const DEFAULT_CACHE_SIZE_LIMIT = 1000; // Maximum number of cache entries
let cacheSizeLimit = DEFAULT_CACHE_SIZE_LIMIT;

// Cache statistics
const cacheStats = {
  hits: 0,
  misses: 0,
  evictions: 0,
  sets: 0,
};

/**
 * Generate cache key from input
 */
const generateCacheKey = (prefix, data) => {
  const dataString = JSON.stringify(data);
  return `${prefix}:${Buffer.from(dataString).toString('base64').substring(0, 50)}`;
};

/**
 * Get cached value (with LRU tracking)
 */
const getCached = (key) => {
  if (!aiConfig.cacheEnabled) {
    cacheStats.misses++;
    return null;
  }

  const cached = cache.get(key);
  if (!cached) {
    cacheStats.misses++;
    return null;
  }

  // Check if expired
  if (Date.now() - cached.timestamp > CACHE_TTL) {
    cache.delete(key);
    cacheStats.misses++;
    return null;
  }

  // Update access time for LRU
  cached.lastAccessed = Date.now();
  cacheStats.hits++;
  return cached.value;
};

/**
 * Set cached value (with LRU eviction)
 */
const setCached = (key, value) => {
  if (!aiConfig.cacheEnabled) {
    return;
  }

  // Evict oldest entries if cache is full
  if (cache.size >= cacheSizeLimit && !cache.has(key)) {
    evictLRU();
  }

  cache.set(key, {
    value,
    timestamp: Date.now(),
    lastAccessed: Date.now(),
  });
  cacheStats.sets++;
};

/**
 * Evict least recently used entry
 */
const evictLRU = () => {
  if (cache.size === 0) return;

  let oldestKey = null;
  let oldestTime = Date.now();

  for (const [key, entry] of cache.entries()) {
    if (entry.lastAccessed < oldestTime) {
      oldestTime = entry.lastAccessed;
      oldestKey = key;
    }
  }

  if (oldestKey) {
    cache.delete(oldestKey);
    cacheStats.evictions++;
  }
};

/**
 * Clear cache by prefix
 */
const clearCacheByPrefix = (prefix) => {
  let cleared = 0;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix + ':')) {
      cache.delete(key);
      cleared++;
    }
  }
  return cleared;
};

/**
 * Get cache statistics (internal function)
 */
const getCacheStatistics = () => {
  const total = cacheStats.hits + cacheStats.misses;
  const hitRate = total > 0 ? (cacheStats.hits / total) * 100 : 0;

  return {
    size: cache.size,
    maxSize: cacheSizeLimit,
    hitRate: parseFloat(hitRate.toFixed(2)),
    hits: cacheStats.hits,
    misses: cacheStats.misses,
    evictions: cacheStats.evictions,
    sets: cacheStats.sets,
    enabled: aiConfig.cacheEnabled,
    ttl: aiConfig.cacheTTL,
  };
};

/**
 * Set cache size limit
 */
const setCacheSizeLimit = (limit) => {
  cacheSizeLimit = Math.max(100, limit); // Minimum 100 entries
  
  // Evict if current size exceeds new limit
  while (cache.size > cacheSizeLimit) {
    evictLRU();
  }
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
        console.error('[AI Service] Error enhancing match score:', {
          error: error.message,
          stack: error.stack,
          jobId: job._id?.toString(),
          freelancerId: freelancer._id?.toString(),
          baseScore,
          timestamp: new Date().toISOString(),
        });
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
      console.error('[AI Service] Error generating proposal draft:', {
        error: error.message,
        stack: error.stack,
        jobId: job._id?.toString(),
        freelancerId: freelancer._id?.toString(),
        timestamp: new Date().toISOString(),
      });
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
   * Generate job recommendations for a freelancer
   * @param {Object} freelancer - Freelancer object (will be sanitized)
   * @param {Array} jobs - Array of job objects to rank
   * @returns {Promise<Array>} Array of jobs with AI recommendation scores
   */
  async generateJobRecommendations(freelancer, jobs) {
    // Check feature flag
    const isEnabled = await adminSettingsService.isFeatureEnabled('jobRecommendations');
    if (!isEnabled) {
      return jobs.map(job => ({
        job,
        aiScore: 0,
        reasoning: 'AI recommendations disabled',
        strengths: [],
        concerns: [],
      }));
    }

    if (!jobs || jobs.length === 0) {
      return [];
    }

    const sanitizedFreelancer = sanitizeUser(freelancer);
    const results = [];

    // Process jobs in parallel with circuit breaker protection
    const fallback = (job) => ({
      job,
      aiScore: 0,
      reasoning: 'AI recommendation unavailable',
      strengths: [],
      concerns: [],
    });

    for (const job of jobs) {
      try {
        const sanitizedJob = sanitizeJob(job);
        
        // Check cache
        const cacheKey = generateCacheKey('jobRec', {
          freelancerId: freelancer._id?.toString(),
          jobId: job._id?.toString(),
        });
        const cached = getCached(cacheKey);
        if (cached) {
          results.push({ job, ...cached });
          continue;
        }

        // Generate prompt
        const prompt = promptManager.generateJobRecommendationPrompt(sanitizedJob, sanitizedFreelancer);
        
        // Call AI with circuit breaker
        const recommendation = await circuitBreaker.execute(async () => {
          const provider = await getProvider();
          const response = await provider.generateText(prompt, {
            maxTokens: 500,
            temperature: 0.6,
          });

          // Parse JSON response
          let analysis;
          try {
            const jsonMatch = response.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              analysis = JSON.parse(jsonMatch[0]);
            } else {
              throw new Error('No JSON found in response');
            }
          } catch (parseError) {
            // Fallback parsing
            analysis = {
              score: 50,
              strengths: ['Skills match'],
              concerns: [],
              reasoning: response.text.substring(0, 200),
            };
          }

          return {
            aiScore: Math.min(100, Math.max(0, analysis.score || 50)),
            reasoning: analysis.reasoning || 'Recommendation generated',
            strengths: Array.isArray(analysis.strengths) ? analysis.strengths : [],
            concerns: Array.isArray(analysis.concerns) ? analysis.concerns : [],
            confidence: response.confidence || 75,
          };
        }, () => fallback(job));

        // Cache result
        setCached(cacheKey, recommendation);

        results.push({ job, ...recommendation });
      } catch (error) {
        console.error('[AI Service] Error generating job recommendation:', {
          error: error.message,
          stack: error.stack,
          jobId: job._id?.toString(),
          freelancerId: freelancer._id?.toString(),
          timestamp: new Date().toISOString(),
        });
        results.push(fallback(job));
      }
    }

    // Sort by AI score descending
    return results.sort((a, b) => b.aiScore - a.aiScore);
  }

  /**
   * Generate freelancer recommendations for a job
   * @param {Object} job - Job object (will be sanitized)
   * @param {Array} freelancers - Array of freelancer objects to rank
   * @returns {Promise<Array>} Array of freelancers with AI recommendation scores
   */
  async generateFreelancerRecommendations(job, freelancers) {
    // Check feature flag
    const isEnabled = await adminSettingsService.isFeatureEnabled('freelancerRecommendations');
    if (!isEnabled) {
      return freelancers.map(freelancer => ({
        freelancer,
        aiScore: 0,
        reasoning: 'AI recommendations disabled',
        strengths: [],
        concerns: [],
      }));
    }

    if (!freelancers || freelancers.length === 0) {
      return [];
    }

    const sanitizedJob = sanitizeJob(job);
    const results = [];

    // Process freelancers in parallel with circuit breaker protection
    const fallback = (freelancer) => ({
      freelancer,
      aiScore: 0,
      reasoning: 'AI recommendation unavailable',
      strengths: [],
      concerns: [],
    });

    for (const freelancer of freelancers) {
      try {
        const sanitizedFreelancer = sanitizeUser(freelancer);
        
        // Check cache
        const cacheKey = generateCacheKey('freelancerRec', {
          jobId: job._id?.toString(),
          freelancerId: freelancer._id?.toString(),
        });
        const cached = getCached(cacheKey);
        if (cached) {
          results.push({ freelancer, ...cached });
          continue;
        }

        // Generate prompt
        const prompt = promptManager.generateFreelancerRecommendationPrompt(sanitizedJob, sanitizedFreelancer);
        
        // Call AI with circuit breaker
        const recommendation = await circuitBreaker.execute(async () => {
          const provider = await getProvider();
          const response = await provider.generateText(prompt, {
            maxTokens: 500,
            temperature: 0.6,
          });

          // Parse JSON response
          let analysis;
          try {
            const jsonMatch = response.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              analysis = JSON.parse(jsonMatch[0]);
            } else {
              throw new Error('No JSON found in response');
            }
          } catch (parseError) {
            // Fallback parsing
            analysis = {
              score: 50,
              strengths: ['Skills match'],
              concerns: [],
              reasoning: response.text.substring(0, 200),
            };
          }

          return {
            aiScore: Math.min(100, Math.max(0, analysis.score || 50)),
            reasoning: analysis.reasoning || 'Recommendation generated',
            strengths: Array.isArray(analysis.strengths) ? analysis.strengths : [],
            concerns: Array.isArray(analysis.concerns) ? analysis.concerns : [],
            confidence: response.confidence || 75,
          };
        }, () => fallback(freelancer));

        // Cache result
        setCached(cacheKey, recommendation);

        results.push({ freelancer, ...recommendation });
      } catch (error) {
        console.error('[AI Service] Error generating freelancer recommendation:', {
          error: error.message,
          stack: error.stack,
          jobId: job._id?.toString(),
          freelancerId: freelancer._id?.toString(),
          timestamp: new Date().toISOString(),
        });
        results.push(fallback(freelancer));
      }
    }

    // Sort by AI score descending
    return results.sort((a, b) => b.aiScore - a.aiScore);
  }

  /**
   * Rank proposals with AI based on proposal quality, profile match, and contract history
   * @param {Object} job - Job object (will be sanitized)
   * @param {Array<Object>} proposalsWithData - Array of { proposal, freelancer, contractHistory }
   * @returns {Promise<Array>} Array of ranked proposals with AI scores
   */
  async rankProposalsWithAI(job, proposalsWithData) {
    // Check feature flag
    const isEnabled = await adminSettingsService.isFeatureEnabled('freelancerRecommendations');
    if (!isEnabled) {
      return proposalsWithData.map(({ proposal, freelancer, contractHistory }) => ({
        proposal,
        freelancer,
        contractHistory,
        aiScore: 0,
        reasoning: 'AI recommendations disabled',
        strengths: [],
        concerns: [],
        confidence: 0,
      }));
    }

    if (!proposalsWithData || proposalsWithData.length === 0) {
      return [];
    }

    const sanitizedJob = sanitizeJob(job);
    
    // Check cache
    const cacheKey = generateCacheKey('proposalRanking', {
      jobId: job._id?.toString(),
      proposalIds: proposalsWithData.map(p => p.proposal._id?.toString() || p.proposal.id).join(','),
    });
    const cached = getCached(cacheKey);
    if (cached) {
      // Merge cached results with original data
      return proposalsWithData.map((item, index) => ({
        ...item,
        ...(cached[index] || {}),
      }));
    }

    try {
      // Generate prompt with all proposals
      const prompt = promptManager.generateProposalRankingPrompt(sanitizedJob, proposalsWithData);
      
      // Call AI with circuit breaker
      const response = await circuitBreaker.execute(async () => {
        const provider = await getProvider();
        return await provider.generateText(prompt, {
          maxTokens: 2000, // More tokens for multiple freelancers
          temperature: 0.6,
        });
      }, () => {
        // Fallback: return basic scores
        return proposalsWithData.map(({ proposal, freelancer, contractHistory }) => ({
          proposal,
          freelancer,
          contractHistory,
          aiScore: 50,
          reasoning: 'AI ranking unavailable',
          strengths: [],
          concerns: [],
          confidence: 0,
        }));
      });

      // Parse JSON response (should be an array)
      let rankings = [];
      try {
        const jsonMatch = response.text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          rankings = JSON.parse(jsonMatch[0]);
        } else {
          // Try to parse individual objects
          const objectMatches = response.text.match(/\{[\s\S]*?\}/g);
          if (objectMatches) {
            rankings = objectMatches.map(match => JSON.parse(match));
          } else {
            throw new Error('No JSON array found in response');
          }
        }
      } catch (parseError) {
        console.error('[AI Service] Error parsing proposal ranking response:', parseError);
        // Fallback: create basic rankings
        rankings = proposalsWithData.map(({ proposal, freelancer, contractHistory }) => ({
          freelancerId: freelancer._id?.toString() || freelancer.id,
          proposalId: proposal._id?.toString() || proposal.id,
          aiScore: 50,
          confidence: 50,
          reasoning: 'Unable to parse AI response',
          strengths: [],
          concerns: [],
        }));
      }

      // Map rankings back to proposals
      const results = proposalsWithData.map(({ proposal, freelancer, contractHistory }) => {
        const proposalId = proposal._id?.toString() || proposal.id;
        const freelancerId = freelancer._id?.toString() || freelancer.id;
        
        // Find matching ranking
        const ranking = rankings.find(r => 
          (r.proposalId && r.proposalId.toString() === proposalId) ||
          (r.freelancerId && r.freelancerId.toString() === freelancerId)
        ) || {};

        return {
          proposal,
          freelancer,
          contractHistory,
          aiScore: Math.min(100, Math.max(0, ranking.aiScore || 50)),
          confidence: Math.min(100, Math.max(0, ranking.confidence || 50)),
          reasoning: ranking.reasoning || 'AI recommendation generated',
          strengths: Array.isArray(ranking.strengths) ? ranking.strengths : [],
          concerns: Array.isArray(ranking.concerns) ? ranking.concerns : [],
          proposalQuality: ranking.proposalQuality || {},
          profileMatch: ranking.profileMatch || {},
          trackRecord: ranking.trackRecord || {},
        };
      });

      // Sort by AI score descending
      const sortedResults = results.sort((a, b) => b.aiScore - a.aiScore);

      // Cache result
      setCached(cacheKey, sortedResults.map(r => ({
        aiScore: r.aiScore,
        confidence: r.confidence,
        reasoning: r.reasoning,
        strengths: r.strengths,
        concerns: r.concerns,
        proposalQuality: r.proposalQuality,
        profileMatch: r.profileMatch,
        trackRecord: r.trackRecord,
      })));

      return sortedResults;
    } catch (error) {
      console.error('[AI Service] Error ranking proposals:', {
        error: error.message,
        stack: error.stack,
        jobId: job._id?.toString(),
        proposalCount: proposalsWithData.length,
        timestamp: new Date().toISOString(),
      });
      
      // Return fallback results
      return proposalsWithData.map(({ proposal, freelancer, contractHistory }) => ({
        proposal,
        freelancer,
        contractHistory,
        aiScore: 50,
        reasoning: 'AI ranking failed',
        strengths: [],
        concerns: [],
        confidence: 0,
      }));
    }
  }

  /**
   * Clear cache by prefix
   * @param {string} prefix - Cache prefix to clear
   * @returns {number} Number of entries cleared
   */
  clearCache(prefix) {
    return clearCacheByPrefix(prefix);
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return getCacheStatistics();
  }

  /**
   * Set cache size limit
   * @param {number} limit - Maximum number of cache entries
   */
  setCacheSizeLimit(limit) {
    setCacheSizeLimit(limit);
  }

  /**
   * Get AI service health and stats
   */
  async getHealthStatus() {
    const circuitBreakerStats = circuitBreaker.getStats();
    const rateLimiterStats = rateLimiterService.getStats();
    const cacheStatistics = getCacheStatistics();
    
    return {
      status: circuitBreakerStats.state === 'OPEN' ? 'unhealthy' : 'healthy',
      enabled: aiConfig.enabled,
      provider: aiConfig.provider,
      circuitBreaker: circuitBreakerStats,
      cache: cacheStatistics,
      rateLimiter: {
        ...rateLimiterStats,
        limits: {
          perUser: {
            proposalGeneration: aiConfig.rateLimit.perUser.proposalGeneration,
            matchCalculation: aiConfig.rateLimit.perUser.matchCalculation,
          },
          global: {
            maxRequests: aiConfig.rateLimit.global.maxRequests,
          },
        },
      },
      features: aiConfig.features,
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

