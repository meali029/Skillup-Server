import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// We'll import modules with mocked dependencies where needed

describe('AI Service additional branches', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('getProvider throws when provider is unknown', async () => {
    jest.doMock('../../../modules/admin/admin.settings.service.js', () => ({ isFeatureEnabled: jest.fn().mockResolvedValue(true), getAIProvider: jest.fn().mockResolvedValue('unknown') }));
    jest.doMock('../../../config/ai.config.js', () => ({ cacheEnabled: false, cacheTTL: 60, enabled: true, provider: 'gemini', features: {}, rateLimit: { proposalGeneration: 10, matchScoring: 10, global: 100 }, gemini: { apiKey: 'x', model: 'g-model', maxTokens: 1000, temperature: 0.5, timeout: 5000 }, circuitBreaker: { errorThreshold: 0.5, timeWindow: 60000, recoveryTime: 10000 } }));

    const aiService = (await import('../../../services/ai/ai.service.js')).default;

    // When provider is unknown the circuit-breaker will use fallback and return base score
    const res = await aiService.enhanceJobMatchScore({ _id: 'j' }, { _id: 'f' }, 10);
    expect(res.aiScore).toBe(10);
    expect(res.reasoning).toMatch(/AI enhancement unavailable/);
  });

  it('getHealthStatus returns expected structure and resetCircuitBreaker calls reset', async () => {
    jest.doMock('../../../config/ai.config.js', () => ({ cacheEnabled: false, cacheTTL: 60, enabled: true, provider: 'gemini', features: {}, rateLimit: { proposalGeneration: 10, matchScoring: 10, global: 100 }, gemini: { apiKey: 'x', model: 'g-model', maxTokens: 1000, temperature: 0.5, timeout: 5000 }, circuitBreaker: { errorThreshold: 0.5, timeWindow: 60000, recoveryTime: 10000 } }));
    jest.doMock('../../../modules/admin/admin.settings.service.js', () => ({ isFeatureEnabled: jest.fn(), getAIProvider: jest.fn().mockResolvedValue('gemini') }));
    jest.doMock('../../../services/ai/circuit-breaker.js', () => ({ getStats: jest.fn(() => ({ state: 'CLOSED' })), reset: jest.fn() }));

    const aiService = (await import('../../../services/ai/ai.service.js')).default;

    const health = await aiService.getHealthStatus();
    expect(health).toHaveProperty('status');
    expect(health).toHaveProperty('cache');

    const cbSpy = (await import('../../../services/ai/circuit-breaker.js')).reset;
    aiService.resetCircuitBreaker();
    expect(cbSpy).toHaveBeenCalled();
  });

  it('batchEnhanceMatchScores returns base values when feature disabled', async () => {
    jest.doMock('../../../config/ai.config.js', () => ({ cacheEnabled: false, cacheTTL: 60, enabled: true, provider: 'gemini', features: {}, rateLimit: { proposalGeneration: 10, matchScoring: 10, global: 100 }, gemini: { apiKey: 'x', model: 'g-model', maxTokens: 1000, temperature: 0.5, timeout: 5000 }, circuitBreaker: { errorThreshold: 0.5, timeWindow: 60000, recoveryTime: 10000 } }));
    jest.doMock('../../../modules/admin/admin.settings.service.js', () => ({ isFeatureEnabled: jest.fn().mockResolvedValue(false) }));

    const aiService = (await import('../../../services/ai/ai.service.js')).default;

    const matches = [{ job: {}, freelancer: {}, baseScore: 30 }, { job: {}, freelancer: {}, baseScore: 40 }];
    const res = await aiService.batchEnhanceMatchScores(matches);

    expect(res[0].aiScore).toBe(30);
    expect(res[1].finalScore).toBe(40);
  });
});