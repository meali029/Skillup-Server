import { describe, it, expect, beforeEach } from '@jest/globals';
import mongoose from 'mongoose';
import Contract from '../../models/Contract.js';
import User from '../../models/User.js';

const CONTRACT_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  COMPLETED: 'completed',
};

const MILESTONE_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
};

describe('Contract Model', () => {
  beforeEach(async () => {
    await Contract.deleteMany({});
    await User.deleteMany({});
  });

  it('canBeViewedBy should work with objectIds and populated docs', async () => {
    const client = await User.create({ name: 'Client', email: 'c@test.com', password: 'pass' });
    const freelancer = await User.create({ name: 'Freelancer', email: 'f@test.com', password: 'pass' });

    const contract = await Contract.create({
      job: new mongoose.Types.ObjectId(),
      proposal: new mongoose.Types.ObjectId(),
      client: client._id,
      freelancer: freelancer._id,
      title: 'Test Contract',
      description: 'Desc',
      totalAmount: 1000,
    });

    expect(contract.canBeViewedBy(client._id)).toBe(true);
    expect(contract.canBeViewedBy(freelancer._id)).toBe(true);
    expect(contract.canBeViewedBy(new mongoose.Types.ObjectId())).toBe(false);

    const populated = await Contract.findById(contract._id).populate('client').populate('freelancer');
    expect(populated.canBeModifiedBy(client._id)).toBe(true);
    expect(populated.canBeModifiedBy(freelancer._id)).toBe(true);
  });

  it('canAddMilestone depends on status', async () => {
    const c = await Contract.create({
      job: new mongoose.Types.ObjectId(),
      proposal: new mongoose.Types.ObjectId(),
      client: new mongoose.Types.ObjectId(),
      freelancer: new mongoose.Types.ObjectId(),
      title: 'Test',
      description: 'd',
      totalAmount: 500,
      status: CONTRACT_STATUS.PENDING,
    });

    expect(c.canAddMilestone()).toBe(true);
    c.status = CONTRACT_STATUS.ACTIVE;
    expect(c.canAddMilestone()).toBe(true);
    c.status = CONTRACT_STATUS.COMPLETED;
    expect(c.canAddMilestone()).toBe(false);
  });

  it('pre-save sets startDate when activating and completedAt when completing', async () => {
    const c = new Contract({
      job: new mongoose.Types.ObjectId(),
      proposal: new mongoose.Types.ObjectId(),
      client: new mongoose.Types.ObjectId(),
      freelancer: new mongoose.Types.ObjectId(),
      title: 'Test2',
      description: 'd',
      totalAmount: 500,
    });

    c.status = CONTRACT_STATUS.ACTIVE;
    await c.save();
    expect(c.startDate).toBeDefined();

    c.status = CONTRACT_STATUS.COMPLETED;
    await c.save();
    expect(c.completedAt).toBeDefined();
  });

  it('pre-save should error if endDate before startDate', async () => {
    const c = new Contract({
      job: new mongoose.Types.ObjectId(),
      proposal: new mongoose.Types.ObjectId(),
      client: new mongoose.Types.ObjectId(),
      freelancer: new mongoose.Types.ObjectId(),
      title: 'Test3',
      description: 'd',
      totalAmount: 500,
      startDate: new Date('2025-01-10'),
      endDate: new Date('2025-01-01'),
    });

    await expect(c.save()).rejects.toThrow('End date cannot be before start date');
  });

  it('milestone completedAt auto-set when milestone status is completed', async () => {
    const c = new Contract({
      job: new mongoose.Types.ObjectId(),
      proposal: new mongoose.Types.ObjectId(),
      client: new mongoose.Types.ObjectId(),
      freelancer: new mongoose.Types.ObjectId(),
      title: 'Test4',
      description: 'd',
      totalAmount: 500,
      milestones: [
        { title: 'm1', amount: 100, status: MILESTONE_STATUS.COMPLETED },
        { title: 'm2', amount: 100, status: MILESTONE_STATUS.PENDING },
      ],
    });

    await c.save();
    const reloaded = await Contract.findById(c._id);
    expect(reloaded.milestones[0].completedAt).toBeDefined();
    expect(reloaded.calculateProgress()).toBe(50);
  });
});