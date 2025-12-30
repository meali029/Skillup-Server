import { describe, it, expect } from '@jest/globals';
import calc from '../../../services/matching/match.score.calculator.js';

const { calculateBaseMatchScore, calculateSkillMatch, calculateExperienceMatch, calculateBudgetMatch, calculateRecencyScore } = calc;

describe('Match Score Calculator', () => {
  it('calculateSkillMatch computes correct percentage and bonus', () => {
    const jobSkills = ['node', 'react', 'graphql'];
    const freelancerSkills = ['React', 'Node', 'css', 'graphql'];
    const score = calculateSkillMatch(jobSkills, freelancerSkills);
    expect(score).toBeGreaterThanOrEqual(100 * (3/3));
  });

  it('calculateExperienceMatch returns expected buckets', () => {
    expect(calculateExperienceMatch('intermediate', 'intermediate')).toBe(100);
    expect(calculateExperienceMatch('expert', 'intermediate')).toBe(75);
    expect(calculateExperienceMatch('expert', 'beginner')).toBe(50);
  });

  it('calculateBudgetMatch handles hourly and fixed properly', () => {
    const jobHourly = { budgetType: 'hourly', hourlyRate: { min: 10, max: 50 } };
    const freelancer = { hourlyRate: 20 };
    expect(calculateBudgetMatch(jobHourly, freelancer)).toBe(100);

    const freelancerHigh = { hourlyRate: 1000 };
    expect(calculateBudgetMatch(jobHourly, freelancerHigh)).toBe(40);

    const jobFixed = { budgetType: 'fixed' };
    expect(calculateBudgetMatch(jobFixed, freelancer)).toBe(70);
  });

  it('calculateRecencyScore gives 100 for recent jobs', () => {
    const recent = new Date();
    expect(calculateRecencyScore(recent)).toBe(100);
    const old = new Date(Date.now() - 1000 * 60 * 60 * 24 * 400);
    expect(calculateRecencyScore(old)).toBe(25);
  });

  it('calculateBaseMatchScore composes components', () => {
    const job = {
      skills: ['node', 'react'],
      experienceLevel: 'intermediate',
      budgetType: 'fixed',
      createdAt: new Date(),
    };

    const freelancer = {
      skills: ['node', 'react', 'graphql'],
      experience: 'intermediate',
      hourlyRate: 20,
      portfolio: [{ title: 'p1', description: 'x'.repeat(100) }],
    };

    const score = calculateBaseMatchScore(job, freelancer);
    expect(typeof score).toBe('number');
    expect(score).toBeGreaterThan(0);
  });
});