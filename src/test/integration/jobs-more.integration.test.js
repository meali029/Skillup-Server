import request from 'supertest';
import createTestApp from './createTestApp.js';
import { createTestClient, createTestUser, generateTestToken } from '../utils.js';

describe('Jobs - Additional Flows', () => {
  it('validation: creating job without required fields fails', async () => {
    const app = createTestApp();
    const client = await createTestClient({ email: `jc+${Date.now()}@example.com` });
    const clientToken = generateTestToken(client);

    // Missing title should fail
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ description: 'Short' })
      .expect(400);

    expect(res.body.success).toBe(false);
  });

  it('authorization: freelancer cannot create a job', async () => {
    const app = createTestApp();
    const freelancer = await createTestUser({ email: `jf+${Date.now()}@example.com`, role: 'freelancer' });
    const token = generateTestToken(freelancer);

    const jobPayload = {
      title: 'Forbidden Job',
      description: 'A'.repeat(60),
      category: 'web-development',
      budgetType: 'fixed',
      budgetAmount: 500,
      duration: '1-3-months',
      experienceLevel: 'intermediate'
    };

    await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send(jobPayload)
      .expect(403);
  });

  it('closing a job prevents new proposals', async () => {
    const app = createTestApp();
    const client = await createTestClient({ email: `jc2+${Date.now()}@example.com` });
    const clientToken = generateTestToken(client);

    const freelancer = await createTestUser({ email: `jf2+${Date.now()}@example.com`, role: 'freelancer' });
    const freelancerToken = generateTestToken(freelancer);

    const jobPayload = {
      title: 'Closable Job',
      description: 'A'.repeat(60),
      category: 'design',
      budgetType: 'fixed',
      budgetAmount: 900,
      duration: '1-3-months',
      experienceLevel: 'intermediate'
    };

    const createRes = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${clientToken}`)
      .send(jobPayload)
      .expect(201);

    const jobId = createRes.body.data.job.id;

    // Client closes job
    await request(app)
      .patch(`/api/jobs/${jobId}/close`)
      .set('Authorization', `Bearer ${clientToken}`)
      .expect(200);

    // Freelancer tries to submit a proposal (should fail)
    const proposalPayload = { jobId, coverLetter: 'C'.repeat(120), bidAmount: 1200, deliveryTime: 7 };

    const attempt = await request(app)
      .post('/api/proposals')
      .set('Authorization', `Bearer ${freelancerToken}`)
      .send(proposalPayload);

    // Should not be accepted; ensure non-201 and is a client error or server handled error
    expect(attempt.status).not.toBe(201);
    expect(attempt.status).toBeGreaterThanOrEqual(400);
  });
});