import { describe, it, expect } from '@jest/globals';
import promptManager from '../../../services/ai/prompt.manager.js';

describe('PromptManager additional cases', () => {
  it('formatValue returns N/A for null/undefined and handles numbers without budget keywords', () => {
    expect(promptManager.formatValue(null, 'any')).toBe('N/A');
    expect(promptManager.formatValue(undefined, 'any')).toBe('N/A');
    expect(promptManager.formatValue(42, 'count')).toBe('42');
  });

  it('array handling for non-portfolio arrays', () => {
    expect(promptManager.formatValue(['x', 'y'], 'skills')).toBe('x, y');
  });

  it('portfolio formatting handles string and object entries', () => {
    const pf1 = ['One', 'Two'];
    expect(promptManager.formatValue(pf1, 'portfolio')).toBe('One; Two');

    const pf2 = [{ title: 'P1', description: 'D1' }, 'Simple'];
    expect(promptManager.formatValue(pf2, 'portfolio')).toContain('P1: D1');
    expect(promptManager.formatValue(pf2, 'portfolio')).toContain('Simple');
  });

  it('generateJob and Freelancer prompts include formatted budget and portfolio', () => {
    const job = { title: 'JobX', description: 'Desc', skills: ['js'], budgetType: 'fixed', budgetAmount: 5000, category: 'cat', duration: '1w' };
    const freelancer = { skills: ['js'], experience: 'senior', hourlyRate: 200, bio: 'Expert', portfolio: [{ title: 'Proj', description: 'Good' }], name: 'Alice', completedJobsCount: 3, totalEarnings: 50000 };

    const j = promptManager.generateJobRecommendationPrompt(job, freelancer);
    expect(j).toContain('JobX');
    expect(j).toContain('PKR');
    expect(j).toContain('Proj: Good');

    const f = promptManager.generateFreelancerRecommendationPrompt(job, freelancer);
    expect(f).toContain('Alice');
    expect(f).toContain('PKR');
    expect(f).toContain('Proj: Good');
  });

  it('generateBidAmount and delivery time prompts render', () => {
    const job = { title: 'JobX', description: 'Desc', budgetType: 'hourly', hourlyRate: { min: 50, max: 100 }, duration: '2w' };
    const freelancer = { hourlyRate: 60, experience: 'mid', completedJobsCount: 2 };

    const bid = promptManager.generateBidAmountPrompt(job, freelancer);
    expect(bid).toContain('PKR');

    const dt = promptManager.generateDeliveryTimePrompt(job, freelancer);
    expect(dt).toContain('2w');
  });

  it('getPrompt throws for missing sub-prompt and top level prompt', () => {
    expect(() => promptManager.getPrompt('proposalGeneration', 'nonexistent')).toThrow();
    expect(() => promptManager.getPrompt('nope')).toThrow();
  });
});