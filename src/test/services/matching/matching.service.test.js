import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock dependencies
jest.mock('../../../services/matching/match.score.calculator.js', () => ({
  calculateBaseMatchScore: jest.fn(() => 60),
}));

jest.mock('../../../services/ai/ai.service.js', () => ({
  enhanceJobMatchScore: jest.fn(),
}));

jest.mock('../../../modules/admin/admin.settings.service.js', () => ({
  isFeatureEnabled: jest.fn(),
}));

import { calculateMatchScore, rankJobs, rankFreelancers, filterJobsByMatchScore, filterFreelancersByMatchScore } from '../../../services/matching/matching.service.js';
import { calculateBaseMatchScore } from '../../../services/matching/match.score.calculator.js';
import aiService from '../../../services/ai/ai.service.js';
import adminSettingsService from '../../../modules/admin/admin.settings.service.js';

describe('matching.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calculateMatchScore uses base score when useAI=false', async () => {
    const job = { title: 'Job A' };
    const freelancer = { name: 'John' };

    const res = await calculateMatchScore(job, freelancer, false);

    expect(calculateBaseMatchScore).toHaveBeenCalledWith(job, freelancer);
    expect(res.baseScore).toBe(60);
    expect(res.aiEnhanced).toBe(false);
    expect(res.confidence).toBe(0);
    expect(res.reasoning).toBe('Rule-based matching');
    expect(res.finalScore).toBe(60);
    expect(res.factors).toBeDefined();
  });

  it('calculateMatchScore uses AI when feature enabled', async () => {
    adminSettingsService.isFeatureEnabled.mockResolvedValue(true);
    aiService.enhanceJobMatchScore.mockResolvedValue({ finalScore: 85, aiScore: 88, confidence: 0.9, reasoning: 'AI adjusted', factors: { skillMatch: 40 } });

    const job = { title: 'Job AI' };
    const freelancer = { name: 'AI John' };

    const res = await calculateMatchScore(job, freelancer, true);

    expect(adminSettingsService.isFeatureEnabled).toHaveBeenCalledWith('matchScoreEnhancement');
    expect(aiService.enhanceJobMatchScore).toHaveBeenCalledWith(job, freelancer, 60);
    expect(res.aiEnhanced).toBe(true);
    expect(res.finalScore).toBe(85);
    expect(res.aiScore).toBe(88);
    expect(res.confidence).toBe(0.9);
    expect(res.reasoning).toBe('AI adjusted');
  });

  it('calculateMatchScore continues with base when AI throws', async () => {
    adminSettingsService.isFeatureEnabled.mockResolvedValue(true);
    aiService.enhanceJobMatchScore.mockRejectedValue(new Error('provider down'));

    const job = { title: 'Job Fail' };
    const freelancer = { name: 'Fail John' };

    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await calculateMatchScore(job, freelancer, true);

    expect(aiService.enhanceJobMatchScore).toHaveBeenCalled();
    expect(res.aiEnhanced).toBe(false);
    expect(res.finalScore).toBe(60);
    spy.mockRestore();
  });

  it('rankJobs returns [] for empty or invalid jobs', async () => {
    const r1 = await rankJobs(null, { skills: ['js'] });
    expect(r1).toEqual([]);

    const r2 = await rankJobs([], { skills: ['js'] });
    expect(r2).toEqual([]);
  });

  it('rankJobs maps jobs to zero scores when freelancer missing', async () => {
    const jobs = [{ id: 'j1' }, { id: 'j2' }];
    const res = await rankJobs(jobs, null, false);
    expect(Array.isArray(res)).toBe(true);
    expect(res[0].matchScore).toBe(0);
    expect(res[1].baseScore).toBe(0);
  });

  it('rankJobs calculates scores and sorts correctly (handles toObject)', async () => {
    // Ensure calculateMatchScore returns different finalScores
    // Override calculateBaseMatchScore to return different base scores per job id
    const baseMock = require('../../../services/matching/match.score.calculator.js');
    const origBase = baseMock.calculateBaseMatchScore;
    baseMock.calculateBaseMatchScore.mockImplementation((job, freelancer) => job.id === 'j2' ? 80 : 20);

    const jobs = [
      { id: 'j1', toObject: jest.fn(() => ({ id: 'j1', title: 'one' })) },
      { id: 'j2', toObject: jest.fn(() => ({ id: 'j2', title: 'two' })) },
    ];

    const res = await rankJobs(jobs, { name: 'F' }, false);
    console.log('RANK JOBS RES', JSON.stringify(res, null, 2));
    expect(res.length).toBe(2);
    // Should be sorted desc by finalScore (80 then 20)
    expect(res[0].id).toBe('j2');
    expect(res[0].matchScore).toBe(80);
    expect(res[1].id).toBe('j1');

    baseMock.calculateBaseMatchScore = origBase;
  });

  it('rankFreelancers returns [] for empty or invalid freelancers', async () => {
    const r1 = await rankFreelancers(null, { title: 't' });
    expect(r1).toEqual([]);

    const r2 = await rankFreelancers([], { title: 't' });
    expect(r2).toEqual([]);
  });

  it('rankFreelancers maps freelancers to zero scores when job missing', async () => {
    const freelancers = [{ id: 'f1' }, { id: 'f2' }];
    const res = await rankFreelancers(freelancers, null, false);
    expect(res[0].matchScore).toBe(0);
    expect(res[1].baseScore).toBe(0);
  });

  it('rankFreelancers calculates scores and sorts correctly (handles plain objects)', async () => {
    // Override calculateBaseMatchScore to return different base scores per freelancer id
    const baseMockF = require('../../../services/matching/match.score.calculator.js');
    const origBaseF = baseMockF.calculateBaseMatchScore;
    baseMockF.calculateBaseMatchScore.mockImplementation((job, freelancer) => freelancer.id === 'f2' ? 70 : 5);

    const freelancers = [ { id: 'f1' }, { id: 'f2' } ];
    const res = await rankFreelancers(freelancers, { title: 't' }, false);
    console.log('RANK FREEL RES', JSON.stringify(res, null, 2));
    expect(res[0].id).toBe('f2');
    expect(res[1].id).toBe('f1');

    baseMockF.calculateBaseMatchScore = origBaseF;
  });

  it('filterJobsByMatchScore and filterFreelancersByMatchScore handle defaults and custom minScore', () => {
    const jobs = [ { id: 'j1', matchScore: 10 }, { id: 'j2', matchScore: 40 }, { id: 'j3', finalScore: 35 } ];
    const filtered = filterJobsByMatchScore(jobs);
    expect(filtered.length).toBe(2);
    const filteredCustom = filterJobsByMatchScore(jobs, 50);
    expect(filteredCustom.length).toBe(0);

    const freelancers = [ { id: 'f1', matchScore: 10 }, { id: 'f2', finalScore: 80 } ];
    const fFiltered = filterFreelancersByMatchScore(freelancers);
    expect(fFiltered.length).toBe(1);
  });

  it('filter functions return [] for invalid inputs', () => {
    expect(filterJobsByMatchScore(null)).toEqual([]);
    expect(filterFreelancersByMatchScore('x')).toEqual([]);
  });
});