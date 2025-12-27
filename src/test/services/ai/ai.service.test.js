import { describe, it, expect, beforeEach } from '@jest/globals';
jest.mock('../../../config/ai.config.js', () => ({ enabled: true, provider: 'gemini', cacheEnabled: false, cacheTTL: 60, features: {}, rateLimit: { proposalGeneration: 10, matchScoring: 10, global: 100 }}));
import aiService from '../../../services/ai/ai.service.js';

// Mock dependencies
jest.mock('../../../modules/admin/admin.settings.service.js', () => ({
  isFeatureEnabled: jest.fn(),
  getAIProvider: jest.fn(),
}));

jest.mock('../../../services/ai/gemini.provider.js', () => ({
  isAvailable: jest.fn(() => true),
  generateText: jest.fn(async () => ({ text: '{"enhancedScore":80,"reasoning":"ok","semanticMatch":80,"contextualFit":80}', confidence: 90 }))
}));

jest.mock('../../../services/ai/prompt.manager.js', () => ({
  generateMatchEnhancementPrompt: jest.fn(() => 'prompt')
}));

jest.mock('../../../services/ai/circuit-breaker.js', () => ({
  execute: jest.fn(async (fn) => fn()),
  getStats: jest.fn(() => ({ state: 'CLOSED' })),
  reset: jest.fn(),
}));

import adminSettingsService from '../../../modules/admin/admin.settings.service.js';
import geminiProvider from '../../../services/ai/gemini.provider.js';
import circuitBreaker from '../../../services/ai/circuit-breaker.js';

describe('AI Service', () => {
  beforeEach(() => {
    // reset mocks
    adminSettingsService.isFeatureEnabled.mockReset();
    adminSettingsService.getAIProvider.mockReset();
    geminiProvider.isAvailable.mockReset();
    geminiProvider.generateText.mockReset();
    circuitBreaker.execute.mockReset();
  });

  it('returns base result when matchScore enhancement disabled', async () => {
    adminSettingsService.isFeatureEnabled.mockResolvedValue(false);

    const res = await aiService.enhanceJobMatchScore({ _id: 'j1' }, { _id: 'f1' }, 50);
    expect(res.aiScore).toBe(50);
    expect(res.confidence).toBe(0);
    expect(res.reasoning).toMatch(/AI enhancement disabled/);
  });

  it('calls provider and returns enhanced score when enabled', async () => {
    adminSettingsService.isFeatureEnabled.mockResolvedValue(true);
    adminSettingsService.getAIProvider.mockResolvedValue('gemini');
    geminiProvider.isAvailable.mockReturnValue(true);
    geminiProvider.generateText.mockResolvedValue({ text: '{"enhancedScore":80,"reasoning":"ok","semanticMatch":80,"contextualFit":80}', confidence: 90 });
    circuitBreaker.execute.mockImplementation(async (fn) => await fn());

    const res = await aiService.enhanceJobMatchScore({ _id: 'j2' }, { _id: 'f2' }, 50);
    expect(res.aiScore).toBe(80);
    expect(res.finalScore).toBeGreaterThanOrEqual(50);
    expect(res.confidence).toBe(90);
  });

  it('parseNumber extracts first integer', () => {
    expect(aiService.parseNumber('Budget is 12345 PKR')).toBe(12345);
    expect(aiService.parseNumber('No number here')).toBe(null);
  });
});