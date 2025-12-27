import request from 'supertest';

// Mock multer config to avoid import.meta in tests
jest.mock('../../config/multer.js', () => ({
  uploadCNIC: { fields: () => (req, res, next) => next() }
}));

import createTestApp from './createTestApp.js';
import { createTestClient, createTestUser, generateTestToken } from '../utils.js';

describe('Proposals Integration', () => {
  it('freelancer submits proposal and client accepts', async () => {
    const app = createTestApp();

    const client = await createTestClient({ email: `pclient+${Date.now()}@example.com` });
    const clientToken = generateTestToken(client);

    // Create a job as client
    const jobPayload = {
      title: 'Job for proposals',
      description: 'D'.repeat(60),
      category: 'design',
      budgetType: 'fixed',
      budgetAmount: 1000,
      duration: '1-3-months',
      experienceLevel: 'intermediate'
    };

    const createJob = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${clientToken}`)
      .send(jobPayload)
      .expect(201);

    const jobId = createJob.body.data.job.id;

    // Create freelancer and submit proposal
    const freelancer = await createTestUser({ email: `pfreelancer+${Date.now()}@example.com`, role: 'freelancer' });
    const freelancerToken = generateTestToken(freelancer);

    const proposalPayload = { jobId, coverLetter: 'C'.repeat(120), bidAmount: 1500, deliveryTime: 7 };

    const submitRes = await request(app)
      .post('/api/proposals')
      .set('Authorization', `Bearer ${freelancerToken}`)
      .send(proposalPayload)
      .expect(201);

    expect(submitRes.body.success).toBe(true);
    const proposalId = submitRes.body.data.proposal._id || submitRes.body.data.proposal.id || submitRes.body.data.proposal;

    // Client accepts proposal
    const acceptRes = await request(app)
      .post(`/api/proposals/${proposalId}/accept`)
      .set('Authorization', `Bearer ${clientToken}`)
      .expect(200);

    expect(acceptRes.body.success).toBe(true);
  });
});