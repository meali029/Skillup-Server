import request from 'supertest';

import createTestApp from './createTestApp.js';
import { createTestClient, createTestUser, generateTestToken } from '../utils.js';

describe('Contracts Integration', () => {
  it('client creates contract from proposal and retrieves it', async () => {
    const app = createTestApp();

    const client = await createTestClient({ email: `c+${Date.now()}@example.com` });
    const clientToken = generateTestToken(client);

    const freelancer = await createTestUser({ email: `f+${Date.now()}@example.com`, role: 'freelancer' });
    const freelancerToken = generateTestToken(freelancer);

    // Client creates job
    const jobPayload = {
      title: 'Contract Job',
      description: 'Contract job description'.repeat(4),
      category: 'design',
      budgetType: 'fixed',
      budgetAmount: 800,
      duration: '1-3-months',
      experienceLevel: 'intermediate'
    };

    const createJob = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${clientToken}`)
      .send(jobPayload)
      .expect(201);

    const jobId = createJob.body.data.job.id;

    // Freelancer submits proposal
    const proposalPayload = { jobId, coverLetter: 'I can do this. '.repeat(20), bidAmount: 800, deliveryTime: 7 };

    const submitRes = await request(app)
      .post('/api/proposals')
      .set('Authorization', `Bearer ${freelancerToken}`)
      .send(proposalPayload)
      .expect(201);

    expect(submitRes.body.success).toBe(true);
    const proposalId = submitRes.body.data.proposal._id || submitRes.body.data.proposal.id || submitRes.body.data.proposal;

    // Client accepts the proposal first
    const acceptRes = await request(app)
      .post(`/api/proposals/${proposalId}/accept`)
      .set('Authorization', `Bearer ${clientToken}`)
      .expect(200);

    expect(acceptRes.body.success).toBe(true);

    // Client creates contract from proposal
    const contractRes = await request(app)
      .post('/api/contracts/from-proposal')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ proposalId, terms: 'Standard terms' })
      .expect(201);

    expect(contractRes.body.success).toBe(true);
    const contractId = contractRes.body.data.contract._id || contractRes.body.data.contract.id;

    // Client fetches contracts
    const listRes = await request(app)
      .get('/api/contracts')
      .set('Authorization', `Bearer ${clientToken}`)
      .expect(200);

    expect(listRes.body.success).toBe(true);
    const contracts = listRes.body.data.contracts || listRes.body.data;
    expect(Array.isArray(contracts)).toBe(true);
    expect(contracts.length).toBeGreaterThanOrEqual(1);

    // Get contract by id
    const getRes = await request(app)
      .get(`/api/contracts/${contractId}`)
      .set('Authorization', `Bearer ${clientToken}`)
      .expect(200);

    expect(getRes.body.success).toBe(true);
    expect(getRes.body.data.contract._id).toBe(contractId);
  });
});