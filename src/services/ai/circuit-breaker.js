/**
 * Circuit Breaker for AI Service
 * Prevents cascading failures when AI provider is down
 */

import aiConfig from '../../config/ai.config.js';

class CircuitBreaker {
  constructor(options = {}) {
    this.errorThreshold = options.errorThreshold || aiConfig.circuitBreaker.errorThreshold;
    this.timeWindow = options.timeWindow || aiConfig.circuitBreaker.timeWindow;
    this.recoveryTime = options.recoveryTime || aiConfig.circuitBreaker.recoveryTime;
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.successCount = 0;
    this.totalRequests = 0;
    this.lastFailureTime = null;
    this.lastCheckTime = Date.now();
    
    // Stats for monitoring
    this.stats = {
      totalCalls: 0,
      successCalls: 0,
      failureCalls: 0,
      circuitOpenCount: 0,
      lastStateChange: Date.now(),
    };
  }

  /**
   * Check if circuit should reset based on time window
   */
  shouldReset() {
    const now = Date.now();
    return now - this.lastCheckTime > this.timeWindow;
  }

  /**
   * Check if circuit should attempt recovery
   */
  shouldAttemptRecovery() {
    if (this.state !== 'OPEN') return false;
    if (!this.lastFailureTime) return false;
    
    const now = Date.now();
    return now - this.lastFailureTime > this.recoveryTime;
  }

  /**
   * Calculate current error rate
   */
  getErrorRate() {
    if (this.totalRequests === 0) return 0;
    return this.failureCount / this.totalRequests;
  }

  /**
   * Check if circuit is open
   */
  isOpen() {
    // Check if we should attempt recovery
    if (this.shouldAttemptRecovery()) {
      console.log('[Circuit Breaker] Attempting recovery - switching to HALF_OPEN');
      this.state = 'HALF_OPEN';
      this.stats.lastStateChange = Date.now();
      return false;
    }

    return this.state === 'OPEN';
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute(fn, fallback = null) {
    this.stats.totalCalls++;

    // Reset counters if time window elapsed
    if (this.shouldReset()) {
      this.failureCount = 0;
      this.successCount = 0;
      this.totalRequests = 0;
      this.lastCheckTime = Date.now();
    }

    // Check if circuit is open
    if (this.isOpen()) {
      console.log('[Circuit Breaker] Circuit is OPEN - using fallback');
      if (fallback) {
        return fallback();
      }
      throw new Error('Circuit breaker is OPEN');
    }

    this.totalRequests++;

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      
      // If fallback exists, use it
      if (fallback) {
        console.log('[Circuit Breaker] Error occurred, using fallback:', error.message);
        return fallback();
      }
      
      throw error;
    }
  }

  /**
   * Handle successful call
   */
  onSuccess() {
    this.successCount++;
    this.stats.successCalls++;

    // If in HALF_OPEN state and success, close the circuit
    if (this.state === 'HALF_OPEN') {
      console.log('[Circuit Breaker] Success in HALF_OPEN state - closing circuit');
      this.state = 'CLOSED';
      this.failureCount = 0;
      this.stats.lastStateChange = Date.now();
    }
  }

  /**
   * Handle failed call
   */
  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.stats.failureCalls++;

    const errorRate = this.getErrorRate();

    // If in HALF_OPEN and failure, reopen circuit
    if (this.state === 'HALF_OPEN') {
      console.log('[Circuit Breaker] Failure in HALF_OPEN state - reopening circuit');
      this.state = 'OPEN';
      this.stats.circuitOpenCount++;
      this.stats.lastStateChange = Date.now();
      return;
    }

    // Check if error threshold exceeded
    if (this.state === 'CLOSED' && errorRate >= this.errorThreshold) {
      console.log(`[Circuit Breaker] Error threshold exceeded (${(errorRate * 100).toFixed(1)}%) - opening circuit`);
      this.state = 'OPEN';
      this.stats.circuitOpenCount++;
      this.stats.lastStateChange = Date.now();
    }
  }

  /**
   * Get current stats
   */
  getStats() {
    return {
      state: this.state,
      errorRate: this.getErrorRate(),
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalRequests: this.totalRequests,
      ...this.stats,
    };
  }

  /**
   * Reset circuit breaker
   */
  reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.totalRequests = 0;
    this.lastFailureTime = null;
    this.lastCheckTime = Date.now();
    console.log('[Circuit Breaker] Circuit breaker reset');
  }
}

// Create singleton instance
const circuitBreaker = new CircuitBreaker();

export default circuitBreaker;
