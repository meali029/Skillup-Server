import { describe, it, expect, beforeEach } from '@jest/globals';
import mongoose from 'mongoose';
import Job from '../../models/Job.js';

describe('Job Model', () => {
  beforeEach(async () => {
    await Job.deleteMany({});
  });

  it('validates title length and description length', async () => {
    const job = new Job({
      title: 'short',
      description: 'too short desc',
      category: 'web-development',
      budgetType: 'fixed',
      budgetAmount: 100,
      duration: '1-2-weeks',
      experienceLevel: 'intermediate',
      client: new mongoose.Types.ObjectId(),
    });

    await expect(job.save()).rejects.toThrow();
  });

  it('requires hourly rate fields for hourly budget type', async () => {
    const job = new Job({
      title: 'Valid Title for Job',
      description: 'x'.repeat(200),
      category: 'web-development',
      budgetType: 'hourly',
      // missing hourlyRate
      duration: '1-2-weeks',
      experienceLevel: 'intermediate',
      client: new mongoose.Types.ObjectId(),
    });

    await expect(job.save()).rejects.toThrow();
  });

  it('auto-closes when maxProposals reached', async () => {
    const job = new Job({
      title: 'Valid Title for Job',
      description: 'x'.repeat(200),
      category: 'web-development',
      budgetType: 'fixed',
      budgetAmount: 1000,
      duration: '1-2-weeks',
      experienceLevel: 'intermediate',
      client: new mongoose.Types.ObjectId(),
      proposalsCount: 50,
      maxProposals: 50,
    });

    await job.save();
    expect(job.status).toBe('closed');
  });

  it('incrementViews increments views', async () => {
    const job = new Job({
      title: 'Valid Title for Job',
      description: 'x'.repeat(200),
      category: 'web-development',
      budgetType: 'fixed',
      budgetAmount: 1000,
      duration: '1-2-weeks',
      experienceLevel: 'intermediate',
      client: new mongoose.Types.ObjectId(),
    });

    await job.save();
    await job.incrementViews();
    const reloaded = await Job.findById(job._id);
    expect(reloaded.views).toBe(1);
  });

  it('budgetDisplay virtual works for fixed and hourly', async () => {
    const fixed = new Job({
      title: 'Valid Title for Job',
      description: 'x'.repeat(200),
      category: 'web-development',
      budgetType: 'fixed',
      budgetAmount: 2000,
      duration: '1-2-weeks',
      experienceLevel: 'intermediate',
      client: new mongoose.Types.ObjectId(),
    });

    const hourly = new Job({
      title: 'Valid Title for Job',
      description: 'x'.repeat(200),
      category: 'web-development',
      budgetType: 'hourly',
      hourlyRate: { min: 10, max: 50 },
      duration: '1-2-weeks',
      experienceLevel: 'intermediate',
      client: new mongoose.Types.ObjectId(),
    });

    await fixed.save();
    await hourly.save();

    expect(fixed.budgetDisplay).toMatch(/\$2,000/);
    expect(hourly.budgetDisplay).toBe(`$${hourly.hourlyRate.min}-$${hourly.hourlyRate.max}/hr`);
  });
});