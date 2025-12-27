import request from 'supertest';

// Mock AI service so draft endpoints work in tests (AI may be disabled in test env)
jest.mock('../../services/ai/ai.service.js', () => ({
  generateProposalDraft: jest.fn(async () => ({
    coverLetter: 'This is an auto-generated draft for testing purposes.',
    bidAmount: 1000,
    deliveryTime: 7,
  })),
}));

import createTestApp from './createTestApp.js';
import { createTestUser, createTestClient, generateTestToken } from '../utils.js';

describe('Proposals - Additional Flows', () => {
  it('validation: submitting proposal with short cover letter fails', async () => {
    const app = createTestApp();

    const client = await createTestClient({ email: `pc+${Date.now()}@example.com` });
    const clientToken = generateTestToken(client);

    const jobPayload = {
      title: 'Proposal Validation Job',
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
      .send(jobPayload);

    if (createJob.status !== 201 || !createJob.body?.success) {
      console.error('createJob failed:', createJob.status, createJob.body);
    }

    expect(createJob.status).toBe(201);
    const jobId = createJob.body.data.job.id;

    const freelancer = await createTestUser({ email: `pf+${Date.now()}@example.com`, role: 'freelancer' });
    const freelancerToken = generateTestToken(freelancer);

    const badProposal = { jobId, coverLetter: 'too short', bidAmount: 1000, deliveryTime: 7 };

    await request(app)
      .post('/api/proposals')
      .set('Authorization', `Bearer ${freelancerToken}`)
      .send(badProposal)
      .expect(400);
  });

  it('freelancer can generate and regenerate proposal drafts (AI draft endpoints)', async () => {
    const app = createTestApp();

    const client = await createTestClient({ email: `pd+${Date.now()}@example.com` });
    const clientToken = generateTestToken(client);

    const jobPayload = {
      title: 'Draft Job for AI Proposals',
      description: 'D'.repeat(60),
      category: 'web-development',
      budgetType: 'fixed',
      budgetAmount: 1000,
      duration: '1-3-months',
      experienceLevel: 'intermediate'
    };

    const createJob = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${clientToken}`)
      .send(jobPayload);

    if (createJob.status !== 201 || !createJob.body?.success) {
      console.error('createJob failed:', createJob.status, createJob.body);
      console.error('createJob.text:', createJob.text);
    }

    expect(createJob.status).toBe(201);
    const jobId = createJob.body.data.job.id;

    const freelancer = await createTestUser({ email: `pd-f+${Date.now()}@example.com`, role: 'freelancer' });
    const freelancerToken = generateTestToken(freelancer);

    const draftRes = await request(app)
      .get(`/api/proposals/draft/${jobId}`)
      .set('Authorization', `Bearer ${freelancerToken}`);

    if (draftRes.status !== 200 || !draftRes.body?.success) {
      console.error('draftRes failed:', draftRes.status, draftRes.body, draftRes.text);
    }

    expect(draftRes.status).toBe(200);
    expect(draftRes.body.success).toBe(true);
    expect(draftRes.body.data).toBeDefined();

    const regenRes = await request(app)
      .post(`/api/proposals/draft/${jobId}/regenerate`)
      .set('Authorization', `Bearer ${freelancerToken}`);

    if (regenRes.status !== 200 || !regenRes.body?.success) {
      console.error('regenRes failed:', regenRes.status, regenRes.body, regenRes.text);
    }

    expect(regenRes.status).toBe(200);
    expect(regenRes.body.success).toBe(true);
  });

  it('freelancer can withdraw their proposal', async () => {
    const app = createTestApp();

    const client = await createTestClient({ email: `pw+${Date.now()}@example.com` });
    const clientToken = generateTestToken(client);

    const jobPayload = {
      title: 'Withdraw Job',
      description: 'W'.repeat(60),
      category: 'design',
      budgetType: 'fixed',
      budgetAmount: 500,
      duration: '1-3-months',
      experienceLevel: 'intermediate'
    };

    const createJob = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${clientToken}`)
      .send(jobPayload);

    if (createJob.status !== 201 || !createJob.body?.success) {
      console.error('createJob failed:', createJob.status, createJob.body);
    }

    expect(createJob.status).toBe(201);
    const jobId = createJob.body.data.job.id;

    const freelancer = await createTestUser({ email: `pw-f+${Date.now()}@example.com`, role: 'freelancer' });
    const freelancerToken = generateTestToken(freelancer);

    const proposalPayload = { jobId, coverLetter: 'C'.repeat(120), bidAmount: 700, deliveryTime: 5 };

    const submitRes = await request(app)
      .post('/api/proposals')
      .set('Authorization', `Bearer ${freelancerToken}`)
      .send(proposalPayload)
      .expect(201);

    const proposalId = submitRes.body.data.proposal._id || submitRes.body.data.proposal.id || submitRes.body.data.proposal;

    // Withdraw
    await request(app)
      .delete(`/api/proposals/${proposalId}`)
      .set('Authorization', `Bearer ${freelancerToken}`)
      .expect(200);

    // Fetch as freelancer and ensure it's not in active proposals
    const meRes = await request(app)
      .get('/api/proposals/me')
      .set('Authorization', `Bearer ${freelancerToken}`)
      .expect(200);

    expect(meRes.body.success).toBe(true);
    const proposals = meRes.body.data.proposals || meRes.body.data;
    expect(Array.isArray(proposals)).toBe(true);
    const found = proposals.find(p => p._id === proposalId || p.id === proposalId);
    if (found) {
      // If the API still returns withdrawn proposals in list, ensure status is withdrawn
      expect(found.status === 'withdrawn' || found.status === 'withdrawn').toBe(true);
    } else {
      expect(found).toBeUndefined();
    }
  });

  it('permission: freelancer cannot accept/reject proposals (client only)', async () => {
    const app = createTestApp();

    const client = await createTestClient({ email: `per+${Date.now()}@example.com` });
    const clientToken = generateTestToken(client);

    const jobPayload = {
      title: 'Permission Job',
      description: 'P'.repeat(60),
      category: 'web-development',
      budgetType: 'fixed',
      budgetAmount: 1000,
      duration: '1-3-months',
      experienceLevel: 'intermediate'
    };

    const createJob = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${clientToken}`)
      .send(jobPayload);

    if (createJob.status !== 201 || !createJob.body?.success) {
      console.error('createJob failed:', createJob.status, createJob.body);
    }

    expect(createJob.status).toBe(201);
    const jobId = createJob.body.data.job.id;

    const freelancer = await createTestUser({ email: `per-f+${Date.now()}@example.com`, role: 'freelancer' });
    const freelancerToken = generateTestToken(freelancer);

    const proposalPayload = { jobId, coverLetter: 'C'.repeat(120), bidAmount: 1100, deliveryTime: 10 };

    const submitRes = await request(app)
      .post('/api/proposals')
      .set('Authorization', `Bearer ${freelancerToken}`)
      .send(proposalPayload)
      .expect(201);

    const proposalId = submitRes.body.data.proposal._id || submitRes.body.data.proposal.id || submitRes.body.data.proposal;

    // Attempt to accept as freelancer (should be forbidden)
    await request(app)
      .post(`/api/proposals/${proposalId}/accept`)
      .set('Authorization', `Bearer ${freelancerToken}`)
      .expect(403);
  });
});