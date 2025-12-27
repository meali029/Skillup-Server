import { describe, it, expect } from '@jest/globals';
import promptManager from '../../../services/ai/prompt.manager.js';

describe('PromptManager', () => {
  it('getPrompt returns prompt and throws on missing', () => {
    const p = promptManager.getPrompt('proposalGeneration', 'coverLetter');
    expect(p).toHaveProperty('template');

    expect(() => promptManager.getPrompt('notThere')).toThrow(/Prompt not found/);
    expect(() => promptManager.getPrompt('proposalGeneration', 'nope')).toThrow(/Prompt not found/);
  });

  it('renderPrompt throws on invalid template', () => {
    expect(() => promptManager.renderPrompt(null)).toThrow(/Invalid prompt template/);
  });

  it('formatValue handles arrays, objects, numbers, and strings', () => {
    expect(promptManager.formatValue([], 'skills')).toBe('None');
    expect(promptManager.formatValue(['a', 'b'], 'skills')).toBe('a, b');
    expect(promptManager.formatValue([{title:'X', description:'Y'}], 'portfolio')).toBe('X: Y');
    expect(promptManager.formatValue({a:1}, 'meta')).toContain('{');
    expect(promptManager.formatValue(12345, 'budget')).toContain('PKR');
    expect(promptManager.formatValue('short string', 'desc')).toBe('short string');

    const longDesc = 'x'.repeat(600);
    expect(promptManager.formatValue(longDesc, 'description')).toHaveLength(500);
  });

  it('formatBudget handles fixed and hourly budgets', () => {
    const fixed = { budgetType: 'fixed', budgetAmount: 10000 };
    expect(promptManager.formatBudget(fixed)).toContain('PKR');

    const hourly = { budgetType: 'hourly', hourlyRate: { min: 100, max: 200 } };
    expect(promptManager.formatBudget(hourly)).toContain('/hour');

    expect(promptManager.formatBudget({})).toBe('Not specified');
  });

  it('generate prompts render without throwing', () => {
    const job = { title: 'T', description: 'D', skills: ['js'], budgetType: 'fixed', budgetAmount: 1000 };
    const freelancer = { skills: ['js'], name: 'F', hourlyRate: 100, bio: 'bio', portfolio: [] };

    expect(() => promptManager.generateCoverLetterPrompt(job, freelancer)).not.toThrow();
    expect(() => promptManager.generateMatchEnhancementPrompt(job, freelancer, 50)).not.toThrow();
  });
});