import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';

// We'll create isolated module loads where necessary

describe('AI Service additional tests', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('uses cache for match enhancement when enabled', async () => {
    // Mock ai.config with cache enabled
    jest.doMock('../../../config/ai.config.js', () => ({ enabled: true, provider: 'gemini', cacheEnabled: true, cacheTTL: 3600, features: {}, rateLimit: { proposalGeneration: 10, matchScoring: 10, global: 100 } }));

    // Mock admin settings, provider, prompt manager and circuit breaker
    jest.doMock('../../../modules/admin/admin.settings.service.js', () => ({ isFeatureEnabled: jest.fn().mockResolvedValue(true), getAIProvider: jest.fn().mockResolvedValue('gemini') }));

    const genMock = { isAvailable: jest.fn().mockReturnValue(true), generateText: jest.fn().mockResolvedValue({ text: '{"enhancedScore":80,"reasoning":"ok","semanticMatch":80,"contextualFit":80}', confidence: 90 }) };
    jest.doMock('../../../services/ai/gemini.provider.js', () => genMock);
    jest.doMock('../../../services/ai/prompt.manager.js', () => ({ generateMatchEnhancementPrompt: jest.fn(() => 'prompt') }));
    jest.doMock('../../../services/ai/circuit-breaker.js', () => ({ execute: jest.fn(async (fn) => fn()) }));

    const aiService = (await import('../../../services/ai/ai.service.js')).default;

    const job = { _id: 'job1' };
    const freelancer = { _id: 'f1' };

    const res1 = await aiService.enhanceJobMatchScore(job, freelancer, 50);
    const res2 = await aiService.enhanceJobMatchScore(job, freelancer, 50);

    // provider.generateText should be called only once due to cache
    expect(genMock.generateText).toHaveBeenCalledTimes(1);
    expect(res2).toEqual(res1);
  });

  it('handles non-JSON provider response gracefully (fallback parsing)', async () => {
    jest.doMock('../../../config/ai.config.js', () => ({ enabled: true, provider: 'gemini', cacheEnabled: false, cacheTTL: 3600, features: {}, rateLimit: { proposalGeneration: 10, matchScoring: 10, global: 100 } }));
    jest.doMock('../../../modules/admin/admin.settings.service.js', () => ({ isFeatureEnabled: jest.fn().mockResolvedValue(true), getAIProvider: jest.fn().mockResolvedValue('gemini') }));
    const genMock = { isAvailable: jest.fn().mockReturnValue(true), generateText: jest.fn().mockResolvedValue({ text: 'No json here just explanation', confidence: 60 }) };
    jest.doMock('../../../services/ai/gemini.provider.js', () => genMock);
    jest.doMock('../../../services/ai/prompt.manager.js', () => ({ generateMatchEnhancementPrompt: jest.fn(() => 'prompt') }));
    jest.doMock('../../../services/ai/circuit-breaker.js', () => ({ execute: jest.fn(async (fn) => fn()) }));

    const aiService = (await import('../../../services/ai/ai.service.js')).default;

    const res = await aiService.enhanceJobMatchScore({ _id: 'j' }, { _id: 'f' }, 30);
    // Because parsing fails, aiScore should equal base score (30)
    expect(res.aiScore).toBe(30);
    expect(res.reasoning).toMatch(/No json here/);
  });

  it('throws AIConfigurationError when provider not available', async () => {
    jest.doMock('../../../config/ai.config.js', () => ({ enabled: true, provider: 'gemini', cacheEnabled: false, cacheTTL: 3600, features: {}, rateLimit: { proposalGeneration: 10, matchScoring: 10, global: 100 } }));
    jest.doMock('../../../modules/admin/admin.settings.service.js', () => ({ isFeatureEnabled: jest.fn().mockResolvedValue(true), getAIProvider: jest.fn().mockResolvedValue('gemini') }));
    const genMock = { isAvailable: jest.fn().mockReturnValue(false) };
    jest.doMock('../../../services/ai/gemini.provider.js', () => genMock);
    jest.doMock('../../../services/ai/prompt.manager.js', () => ({ generateMatchEnhancementPrompt: jest.fn(() => 'prompt') }));
    jest.doMock('../../../services/ai/circuit-breaker.js', () => ({ execute: jest.fn(async (fn) => await fn()) }));

    const aiService = (await import('../../../services/ai/ai.service.js')).default;

    await expect(aiService.enhanceJobMatchScore({ _id: 'j' }, { _id: 'f' }, 10)).rejects.toMatchObject({ message: expect.stringContaining('Gemini provider is not available') });
  });

  it('generateProposalDraft success and cover letter validation', async () => {
    jest.doMock('../../../config/ai.config.js', () => ({ enabled: true, provider: 'gemini', cacheEnabled: false, cacheTTL: 3600, features: {}, rateLimit: { proposalGeneration: 10, matchScoring: 10, global: 100 } }));
    jest.doMock('../../../modules/admin/admin.settings.service.js', () => ({ isFeatureEnabled: jest.fn((f) => Promise.resolve(true)), getAIProvider: jest.fn().mockResolvedValue('gemini') }));

    const genMock = {
      isAvailable: jest.fn().mockReturnValue(true),
      generateText: jest.fn()
        .mockResolvedValueOnce({ text: 'X'.repeat(300), confidence: 80 }) // cover letter
        .mockResolvedValueOnce({ text: '1500', confidence: 80 }) // bid
        .mockResolvedValueOnce({ text: '10', confidence: 80 }), // delivery time
    };

    jest.doMock('../../../services/ai/gemini.provider.js', () => genMock);
    jest.doMock('../../../services/ai/prompt.manager.js', () => ({ generateCoverLetterPrompt: jest.fn(() => 'prompt1'), generateBidAmountPrompt: jest.fn(() => 'prompt2'), generateDeliveryTimePrompt: jest.fn(() => 'prompt3') }));
    jest.doMock('../../../services/ai/circuit-breaker.js', () => ({ execute: jest.fn(async (fn) => await fn()) }));

    const aiService = (await import('../../../services/ai/ai.service.js')).default;

    const draft = await aiService.generateProposalDraft({ budgetAmount: 5000 }, { hourlyRate: 100 });
    expect(draft.coverLetter.length).toBeGreaterThan(100);
    expect(draft.bidAmount).toBeGreaterThanOrEqual(500);
    expect(draft.deliveryTime).toBeGreaterThanOrEqual(1);
  });

  it('generateProposalDraft throws AIProviderError if cover letter too short', async () => {
    jest.doMock('../../../config/ai.config.js', () => ({ enabled: true, provider: 'gemini', cacheEnabled: false, cacheTTL: 3600, features: {}, rateLimit: { proposalGeneration: 10, matchScoring: 10, global: 100 } }));
    jest.doMock('../../../modules/admin/admin.settings.service.js', () => ({ isFeatureEnabled: jest.fn((f) => Promise.resolve(true)), getAIProvider: jest.fn().mockResolvedValue('gemini') }));

    const genMock = {
      isAvailable: jest.fn().mockReturnValue(true),
      generateText: jest.fn()
        .mockResolvedValueOnce({ text: 'short', confidence: 50 }) // cover letter too short
        .mockResolvedValueOnce({ text: '1000', confidence: 80 }) // bid
        .mockResolvedValueOnce({ text: '10', confidence: 80 }), // delivery time
    };

    jest.doMock('../../../services/ai/gemini.provider.js', () => genMock);
    jest.doMock('../../../services/ai/prompt.manager.js', () => ({ generateCoverLetterPrompt: jest.fn(() => 'prompt1'), generateBidAmountPrompt: jest.fn(() => 'prompt2'), generateDeliveryTimePrompt: jest.fn(() => 'prompt3') }));
    jest.doMock('../../../services/ai/circuit-breaker.js', () => ({ execute: jest.fn(async (fn) => await fn()) }));

    const aiService = (await import('../../../services/ai/ai.service.js')).default;

    await expect(aiService.generateProposalDraft({ budgetAmount: 5000 }, { hourlyRate: 100 })).rejects.toMatchObject({ message: expect.stringContaining('Failed to generate proposal draft') });
  });

  it('batchEnhanceMatchScores processes in batches', async () => {
    jest.doMock('../../../config/ai.config.js', () => ({ enabled: true, provider: 'gemini', cacheEnabled: false, cacheTTL: 3600, features: {}, rateLimit: { proposalGeneration: 10, matchScoring: 10, global: 100 } }));
    jest.doMock('../../../modules/admin/admin.settings.service.js', () => ({ isFeatureEnabled: jest.fn().mockResolvedValue(true), getAIProvider: jest.fn().mockResolvedValue('gemini') }));

    // Mock aiService.enhanceJobMatchScore to avoid calling provider
    const aiServiceModule = await import('../../../services/ai/ai.service.js');
    const aiService = aiServiceModule.default;

    const spy = jest.spyOn(aiService, 'enhanceJobMatchScore').mockImplementation(async (job, freelancer, baseScore) => ({ baseScore, aiScore: baseScore + 1, finalScore: baseScore + 1 }));

    // Create 7 matches so batching with size 5 causes at least one delay
    const matches = Array.from({ length: 7 }).map((_, i) => ({ job: { id: `j${i}` }, freelancer: { id: `f${i}` }, baseScore: i }));

    jest.useFakeTimers();
    const promise = aiService.batchEnhanceMatchScores(matches);

    // Run all timers (allow the internal setTimeout delays to fire)
    if (typeof jest.runAllTimersAsync === 'function') {
      await jest.runAllTimersAsync();
    } else {
      jest.runAllTimers();
    }

    const results = await promise;

    expect(spy).toHaveBeenCalledTimes(7);
    expect(results.length).toBe(7);

    spy.mockRestore();
    jest.useRealTimers();
  });
});