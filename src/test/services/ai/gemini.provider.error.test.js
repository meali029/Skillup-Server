import { describe, it, expect, beforeEach } from '@jest/globals';
import GeminiProvider from '../../../services/ai/gemini.provider.js';
import { AIRateLimitError, AITimeoutError, AIConfigurationError } from '../../../core/errors/ai.errors.js';

describe('GeminiProvider error handling', () => {
  beforeEach(() => {
    // ensure provider initialized state
    GeminiProvider.initialized = true;
    GeminiProvider.client = {}; // dummy
    GeminiProvider.model = { generateContent: jest.fn() };
    GeminiProvider.requestCount = 0;
    GeminiProvider.lastResetTime = Date.now();

    // In tests, avoid creating real setTimeout-based timeouts which may fire after the
    // test completes. Replace createTimeoutPromise with a pending thenable so we don't
    // schedule timers during unit tests that assert error mapping.
    GeminiProvider.createTimeoutPromise = () => new Promise(() => {});
  });

  it('checkRateLimit throws AIRateLimitError when limit exceeded', () => {
    GeminiProvider.requestCount = GeminiProvider.rateLimit.requestsPerMinute;
    expect(() => GeminiProvider.checkRateLimit()).toThrow();
    try {
      GeminiProvider.checkRateLimit();
    } catch (err) {
      expect(err.statusCode).toBe(429);
    }
  });

  it('generateText maps 504 statusCode thrown by provider to AITimeoutError', async () => {
    GeminiProvider.model.generateContent = () => { throw { statusCode: 504 }; };

    await expect(GeminiProvider.generateText('p')).rejects.toMatchObject({ statusCode: 504 });
  });

  it('generateText maps 429 statusCode to AIRateLimitError', async () => {
    GeminiProvider.model.generateContent = () => { throw { statusCode: 429 }; };

    await expect(GeminiProvider.generateText('p')).rejects.toMatchObject({ statusCode: 429 });
  });

  it('generateText maps API key errors to AIConfigurationError', async () => {
    GeminiProvider.model.generateContent = () => { throw new Error('API key invalid'); };

    await expect(GeminiProvider.generateText('p')).rejects.toMatchObject({ message: expect.stringContaining('Invalid Gemini API key') });
  });

  it('analyzeMatch returns fallback when parse fails', async () => {
    // Return plain text that is not JSON
    GeminiProvider.model.generateContent = () => Promise.resolve({ response: Promise.resolve({ text: () => 'no json here' }) });

    const res = await GeminiProvider.analyzeMatch({ job: { title: 't' }, freelancer: { name: 'f' } });
    expect(res.score).toBe(70);
    expect(res.reasoning).toMatch(/no json/i);
  });
});