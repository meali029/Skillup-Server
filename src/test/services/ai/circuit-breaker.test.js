import { describe, it, expect, beforeEach } from '@jest/globals';
import circuitBreaker from '../../../services/ai/circuit-breaker.js';

describe('CircuitBreaker', () => {
  beforeEach(() => {
    circuitBreaker.reset();
    // make deterministic
    circuitBreaker.errorThreshold = 0.5;
  });

  it('execute uses fallback when circuit is OPEN', async () => {
    circuitBreaker.state = 'OPEN';
    const res = await circuitBreaker.execute(() => { throw new Error('should not run'); }, () => 'fallback');
    expect(res).toBe('fallback');
  });

  it('onFailure opens circuit when error rate exceeds threshold', () => {
    circuitBreaker.state = 'CLOSED';
    circuitBreaker.failureCount = 0;
    circuitBreaker.totalRequests = 1; // so after onFailure failureCount=1 -> 1/1 =1

    circuitBreaker.onFailure();
    expect(circuitBreaker.state).toBe('OPEN');
  });

  it('shouldAttemptRecovery and isOpen transitions to HALF_OPEN', () => {
    circuitBreaker.state = 'OPEN';
    circuitBreaker.lastFailureTime = Date.now() - (circuitBreaker.recoveryTime + 1000);

    const wasOpen = circuitBreaker.isOpen();
    expect(wasOpen).toBe(false);
    expect(circuitBreaker.state).toBe('HALF_OPEN');
  });

  it('onSuccess closes circuit when in HALF_OPEN', () => {
    circuitBreaker.state = 'HALF_OPEN';
    circuitBreaker.onSuccess();
    expect(circuitBreaker.state).toBe('CLOSED');
    expect(circuitBreaker.failureCount).toBe(0);
  });
});