import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Reset modules to ensure ai.config is mocked before provider loads
jest.resetModules();

// Mock ai.config with apiKey
jest.doMock('../../../config/ai.config.js', () => ({
  gemini: { apiKey: 'test-key', model: 'g-model', maxTokens: 1000, temperature: 0.5, timeout: 5000 },
}));

import GeminiProvider from '../../../services/ai/gemini.provider.js';

// Overwrite the provider model's generateContent for predictable responses in tests
GeminiProvider.model = {
  generateContent: jest.fn(() => Promise.resolve({ response: Promise.resolve({ text: () => ' {"score":90,"strengths":["A"],"concerns":[],"reasoning":"ok"} ' }) })),
};
describe('GeminiProvider', () => {
  it('isAvailable should be true when apiKey provided', () => {
    expect(GeminiProvider.isAvailable()).toBe(true);
  });

  it('generateText returns trimmed text and tokensUsed', async () => {
    const res = await GeminiProvider.generateText('hello prompt', { maxTokens: 50, temperature: 0.2 });
    expect(res.text).toContain('{"score":90');
    expect(res.tokensUsed).toBeGreaterThan(0);
    expect(res.confidence).toBeDefined();
  });

  it('analyzeMatch parses json response into analysis', async () => {
    const analysis = await GeminiProvider.analyzeMatch({ job: { title: 't' }, freelancer: { name: 'f' } });
    expect(analysis.score).toBe(90);
    expect(Array.isArray(analysis.strengths)).toBe(true);
  });

  it('parseMatchAnalysis throws on invalid json', () => {
    expect(() => GeminiProvider.parseMatchAnalysis('not json')).toThrow();
  });

  it('generateEmbeddings returns an array of length 768', async () => {
    const emb = await GeminiProvider.generateEmbeddings('x');
    expect(Array.isArray(emb)).toBe(true);
    expect(emb.length).toBe(768);
  });
});