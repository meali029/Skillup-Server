import { GoogleGenerativeAI } from '@google/generative-ai';
import AIProviderInterface from './ai.provider.interface.js';
import aiConfig from '../../config/ai.config.js';
import {
  AIProviderError,
  AITimeoutError,
  AIRateLimitError,
  AIConfigurationError,
  AIInvalidResponseError,
} from '../../core/errors/ai.errors.js';

/**
 * Google Gemini AI Provider Implementation
 * Implements the AIProviderInterface for Google Gemini
 */
class GeminiProvider extends AIProviderInterface {
  constructor() {
    super();
    this.name = 'gemini';
    this.client = null;
    this.model = null;
    this.initialized = false;
    this.requestCount = 0;
    this.lastResetTime = Date.now();
    
    // Rate limits (Gemini free tier: 60 requests/minute)
    this.rateLimit = {
      requestsPerMinute: 60,
      requestsPerHour: 1000,
      requestsPerDay: 10000,
    };

    this.initialize();
  }

  /**
   * Initialize Gemini client
   */
  initialize() {
    try {
      if (!aiConfig.gemini.apiKey) {
        console.warn('⚠️  GEMINI_API_KEY not configured. Gemini provider will be unavailable.');
        this.initialized = false;
        return;
      }

      this.client = new GoogleGenerativeAI(aiConfig.gemini.apiKey);
      this.model = this.client.getGenerativeModel({ 
        model: aiConfig.gemini.model 
      });
      this.initialized = true;
      console.log(`✅ Gemini provider initialized with model: ${aiConfig.gemini.model}`);
    } catch (error) {
      console.error('❌ Failed to initialize Gemini provider:', error.message);
      this.initialized = false;
    }
  }

  /**
   * Check if provider is available
   */
  isAvailable() {
    return this.initialized && this.client !== null && this.model !== null;
  }

  /**
   * Get provider name
   */
  getName() {
    return this.name;
  }

  /**
   * Get rate limit information
   */
  getRateLimit() {
    return this.rateLimit;
  }

  /**
   * Check rate limits
   */
  checkRateLimit() {
    const now = Date.now();
    const timeSinceReset = now - this.lastResetTime;

    // Reset counter every minute
    if (timeSinceReset >= 60000) {
      this.requestCount = 0;
      this.lastResetTime = now;
    }

    if (this.requestCount >= this.rateLimit.requestsPerMinute) {
      const retryAfter = Math.ceil((60000 - timeSinceReset) / 1000);
      throw AIRateLimitError(retryAfter);
    }
  }

  /**
   * Create timeout promise
   */
  createTimeoutPromise(timeout) {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(AITimeoutError(timeout));
      }, timeout);
    });
  }

  /**
   * Generate text using Gemini
   */
  async generateText(prompt, options = {}) {
    if (!this.isAvailable()) {
      throw AIConfigurationError('Gemini provider is not initialized');
    }

    this.checkRateLimit();

    const maxTokens = options.maxTokens || aiConfig.gemini.maxTokens;
    const temperature = options.temperature ?? aiConfig.gemini.temperature;
    const timeout = options.timeout || aiConfig.gemini.timeout;

    try {
      this.requestCount++;

      // Create timeout promise
      const timeoutPromise = this.createTimeoutPromise(timeout);

      // Create generation promise
      const generationPromise = this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature: temperature,
        },
      });

      // Race between generation and timeout
      const result = await Promise.race([generationPromise, timeoutPromise]);
      const response = await result.response;
      const text = response.text();

      // Calculate tokens (approximate)
      const tokensUsed = Math.ceil((prompt.length + text.length) / 4);

      return {
        text: text.trim(),
        tokensUsed: tokensUsed,
        confidence: 85, // Gemini doesn't provide confidence, use default
      };
    } catch (error) {
      // Handle specific errors
      if (error.statusCode === 429) {
        throw AIRateLimitError();
      } else if (error.statusCode === 504) {
        throw AITimeoutError(timeout);
      } else if (error.message?.includes('API key')) {
        throw AIConfigurationError('Invalid Gemini API key');
      } else {
        throw AIProviderError(error.message || 'Unknown Gemini error', 500);
      }
    }
  }

  /**
   * Generate embeddings (not supported by Gemini free tier, return mock)
   */
  async generateEmbeddings(text) {
    // Gemini free tier doesn't support embeddings
    // Return mock embedding for compatibility
    console.warn('⚠️  Embeddings not supported by Gemini free tier');
    return new Array(768).fill(0).map(() => Math.random());
  }

  /**
   * Analyze match between job and freelancer
   */
  async analyzeMatch(context) {
    if (!context.job || !context.freelancer) {
      throw AIProviderError('Invalid match context: job and freelancer required');
    }

    const prompt = this.buildMatchAnalysisPrompt(context);
    const response = await this.generateText(prompt, {
      maxTokens: 500,
      temperature: 0.5, // Lower temperature for more consistent analysis
    });

    try {
      // Parse JSON response
      const analysis = this.parseMatchAnalysis(response.text);
      return analysis;
    } catch (error) {
      // If parsing fails, return basic analysis
      console.warn('⚠️  Failed to parse match analysis, using fallback');
      return {
        score: 70,
        strengths: ['Skills match', 'Experience aligned'],
        concerns: [],
        reasoning: response.text.substring(0, 200),
      };
    }
  }

  /**
   * Build prompt for match analysis
   */
  buildMatchAnalysisPrompt(context) {
    const { job, freelancer } = context;

    return `Analyze the match between this job and freelancer profile.

JOB:
Title: ${job.title || 'N/A'}
Description: ${(job.description || '').substring(0, 500)}
Required Skills: ${(job.skills || []).join(', ')}
Experience Level: ${job.experienceLevel || 'N/A'}
Budget: ${job.budgetAmount || job.hourlyRate || 'N/A'}

FREELANCER:
Skills: ${(freelancer.skills || []).join(', ')}
Experience: ${freelancer.experience || 'N/A'}
Hourly Rate: ${freelancer.hourlyRate || 'N/A'}
Bio: ${(freelancer.bio || '').substring(0, 200)}

Provide a JSON response with this structure:
{
  "score": <number 0-100>,
  "strengths": ["strength1", "strength2"],
  "concerns": ["concern1", "concern2"],
  "reasoning": "<brief explanation>"
}`;
  }

  /**
   * Parse match analysis from AI response
   */
  parseMatchAnalysis(text) {
    // Try to extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        score: Math.min(100, Math.max(0, parsed.score || 70)),
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
        concerns: Array.isArray(parsed.concerns) ? parsed.concerns : [],
        reasoning: parsed.reasoning || 'Match analysis completed',
      };
    }

    // Fallback parsing
    throw new Error('Could not parse JSON from response');
  }
}

// Export singleton instance
export default new GeminiProvider();



