import request from 'supertest';

// Mock multer config to avoid import.meta in tests
jest.mock('../../config/multer.js', () => ({
  uploadCNIC: { fields: () => (req, res, next) => next() }
}));

import createTestApp from './createTestApp.js';
import { createTestClient, createTestUser, generateTestToken } from '../utils.js';

describe('Jobs Integration', () => {
  it('client creates job and freelancer views recommended', async () => {
    const app = createTestApp();

    const client = await createTestClient({ email: `client+${Date.now()}@example.com` });
    const clientToken = generateTestToken(client);

    // Create job
    const jobPayload = {
      title: 'Integration Job 12345',
      description: 'A'.repeat(60),
      category: 'web-development',
      budgetType: 'fixed',
      budgetAmount: 500,
      duration: '1-3-months',
      experienceLevel: 'intermediate'
    };

    const createRes = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${clientToken}`)
      .send(jobPayload)
      .expect(201);

    expect(createRes.body.success).toBe(true);
    const jobId = createRes.body.data.job.id;

    // Fetch job
    const getRes = await request(app)
      .get(`/api/jobs/${jobId}`)
      .set('Authorization', `Bearer ${clientToken}`)
      .expect(200);

    expect(getRes.body.success).toBe(true);
    expect(getRes.body.data.job.title).toBe(jobPayload.title);

    // Freelancer gets recommended jobs (requires freelancer token)
    const freelancer = await createTestUser({ email: `freelancer+${Date.now()}@example.com`, role: 'freelancer' });
    const freelancerToken = generateTestToken(freelancer);

    const recRes = await request(app)
      .get('/api/jobs/freelancer/recommended')
      .set('Authorization', `Bearer ${freelancerToken}`)
      .expect(200);

    expect(recRes.body.success).toBe(true);
  });
});