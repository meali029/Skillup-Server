/**
 * AI Provider Interface
 * Defines the contract that all AI providers must implement
 * This allows swapping between Gemini, OpenAI, or other providers
 */

/**
 * @typedef {Object} AIGenerateOptions
 * @property {number} maxTokens - Maximum tokens in response
 * @property {number} temperature - Creativity level (0-1)
 * @property {number} timeout - Request timeout in ms
 */

/**
 * @typedef {Object} AIResponse
 * @property {string} text - Generated text
 * @property {number} tokensUsed - Tokens consumed
 * @property {number} confidence - Confidence score (0-100)
 */

/**
 * @typedef {Object} MatchContext
 * @property {Object} job - Job data (sanitized)
 * @property {Object} freelancer - Freelancer data (sanitized)
 */

/**
 * @typedef {Object} MatchAnalysis
 * @property {number} score - Match score (0-100)
 * @property {string[]} strengths - Key strengths
 * @property {string[]} concerns - Potential concerns
 * @property {string} reasoning - Explanation
 */

/**
 * @typedef {Object} RateLimit
 * @property {number} requestsPerMinute - Requests allowed per minute
 * @property {number} requestsPerHour - Requests allowed per hour
 * @property {number} requestsPerDay - Requests allowed per day
 */

/**
 * Base AI Provider Interface
 * All AI providers must implement these methods
 */
class AIProviderInterface {
  /**
   * Generate text using AI
   * @param {string} prompt - Input prompt
   * @param {AIGenerateOptions} options - Generation options
   * @returns {Promise<AIResponse>} Generated response
   */
  async generateText(prompt, options = {}) {
    throw new Error('generateText() must be implemented by provider');
  }

  /**
   * Generate embeddings for text
   * @param {string} text - Text to embed
   * @returns {Promise<number[]>} Embedding vector
   */
  async generateEmbeddings(text) {
    throw new Error('generateEmbeddings() must be implemented by provider');
  }

  /**
   * Analyze match between job and freelancer
   * @param {MatchContext} context - Match context
   * @returns {Promise<MatchAnalysis>} Match analysis
   */
  async analyzeMatch(context) {
    throw new Error('analyzeMatch() must be implemented by provider');
  }

  /**
   * Check if provider is available
   * @returns {boolean} True if available
   */
  isAvailable() {
    throw new Error('isAvailable() must be implemented by provider');
  }

  /**
   * Get rate limit information
   * @returns {RateLimit} Rate limit details
   */
  getRateLimit() {
    throw new Error('getRateLimit() must be implemented by provider');
  }

  /**
   * Get provider name
   * @returns {string} Provider name
   */
  getName() {
    throw new Error('getName() must be implemented by provider');
  }
}

export default AIProviderInterface;




