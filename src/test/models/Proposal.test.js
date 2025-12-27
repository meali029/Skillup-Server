import { describe, it, expect, beforeEach } from '@jest/globals';
import mongoose from 'mongoose';
import Proposal from '../../models/Proposal.js';

describe('Proposal Model', () => {
  beforeEach(async () => {
    await Proposal.deleteMany({});
  });

  it('validates minimum bidAmount and coverLetter length', async () => {
    const p = new Proposal({
      freelancerId: new mongoose.Types.ObjectId(),
      jobId: new mongoose.Types.ObjectId(),
      coverLetter: 'short',
      bidAmount: 100,
      deliveryTime: 1,
    });

    await expect(p.save()).rejects.toThrow();
  });

  it('prevents duplicate proposals for same freelancer and job', async () => {
    const freelancer = new mongoose.Types.ObjectId();
    const job = new mongoose.Types.ObjectId();

    await Proposal.collection.createIndex({ freelancerId: 1, jobId: 1 }, { unique: true });

    await Proposal.create({ freelancerId: freelancer, jobId: job, coverLetter: 'x'.repeat(150), bidAmount: 1000, deliveryTime: 5 });

    await expect(
      Proposal.create({ freelancerId: freelancer, jobId: job, coverLetter: 'x'.repeat(150), bidAmount: 1000, deliveryTime: 5 })
    ).rejects.toThrow();
  });
});