import { describe, it, expect } from '@jest/globals';
import mongoose from 'mongoose';
import Dispute from '../../models/Dispute.js';
import Contract from '../../models/Contract.js';
import Job from '../../models/Job.js';
import Proposal from '../../models/Proposal.js';
import User from '../../models/User.js';

describe('Dispute Model', () => {
  it('creates a dispute with defaults and methods work', async () => {
    const client = await User.create({ name: 'Client User', email: 'client1@example.com' });
    const freelancer = await User.create({ name: 'Freelancer User', email: 'freelancer1@example.com' });

    const job = await Job.create({
      title: 'Sample Job Title 123',
      description: 'A'.repeat(60),
      category: 'web-development',
      budgetType: 'fixed',
      budgetAmount: 10000,
      duration: '1-3-months',
      experienceLevel: 'intermediate',
      client: client._id,
    });

    const proposal = await Proposal.create({
      freelancerId: freelancer._id,
      jobId: job._id,
      coverLetter: 'C'.repeat(120),
      bidAmount: 1000,
      deliveryTime: 7,
    });

    const contract = await Contract.create({
      job: job._id,
      proposal: proposal._id,
      client: client._id,
      freelancer: freelancer._id,
      title: 'Contract Title',
      description: 'Contract description goes here',
      totalAmount: 1000,
    });

    const dispute = await Dispute.create({
      contractId: contract._id,
      raisedBy: 'client',
      raisedByUserId: client._id.toString(),
      reason: 'Some reason',
      description: 'Detailed description of the dispute',
    });

    expect(dispute).toBeDefined();
    expect(dispute.disputeId).toBeTruthy();
    expect(dispute.status).toBe('OPEN');

    // Test resolve
    const adminId = freelancer._id;
    const resolved = await dispute.resolve('Resolved in favour', adminId);
    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.resolution).toBe('Resolved in favour');
    expect(resolved.resolvedBy.toString()).toBe(adminId.toString());
    expect(resolved.resolvedAt).toBeDefined();

    // Test reject by creating another dispute
    const dispute2 = await Dispute.create({
      contractId: contract._id,
      raisedBy: 'freelancer',
      raisedByUserId: freelancer._id.toString(),
      reason: 'Another reason',
      description: 'Another description',
    });

    const rejected = await dispute2.reject('Not valid', adminId);
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.resolution).toBe('Not valid');

    // Test addAdminNote
    const dispute3 = await Dispute.create({
      contractId: contract._id,
      raisedBy: 'client',
      raisedByUserId: client._id.toString(),
      reason: 'Note reason',
      description: 'Note description',
    });

    const noted = await dispute3.addAdminNote('Admin note here', adminId);
    expect(noted.adminNotes.length).toBe(1);
    expect(noted.adminNotes[0].note).toBe('Admin note here');
    expect(noted.adminNotes[0].addedBy.toString()).toBe(adminId.toString());
  });
});