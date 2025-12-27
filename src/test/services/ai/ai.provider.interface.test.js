import { describe, it, expect } from '@jest/globals';
import AIProviderInterface from '../../../services/ai/ai.provider.interface.js';

describe('AIProviderInterface', () => {
  it('methods throw when not implemented', async () => {
    const inst = new AIProviderInterface();

    await expect(inst.generateText('x')).rejects.toThrow('generateText() must be implemented');
    await expect(inst.generateEmbeddings('x')).rejects.toThrow('generateEmbeddings() must be implemented');
    await expect(inst.analyzeMatch({})).rejects.toThrow('analyzeMatch() must be implemented');
    expect(() => inst.isAvailable()).toThrow('isAvailable() must be implemented');
    expect(() => inst.getRateLimit()).toThrow('getRateLimit() must be implemented');
    expect(() => inst.getName()).toThrow('getName() must be implemented');
  });
});