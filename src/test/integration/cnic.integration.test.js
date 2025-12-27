import request from 'supertest';

// Mock multer config to avoid import.meta in tests
jest.mock('../../config/multer.js', () => ({
  uploadCNIC: { fields: () => (req, res, next) => next() }
}));

import createTestApp from './createTestApp.js';
import { createTestUser, createTestAdmin, generateTestToken } from '../utils.js';

// Mock image processing and OCR so tests don't depend on external libs
jest.mock('../../core/utils/imageProcessor.js', () => ({
  processCNICImage: jest.fn(async (p) => '/tmp/processed.png'),
  deleteCNICImages: jest.fn()
}));

jest.mock('../../services/ocr.service.template.js', () => ({
  extractCNICData: jest.fn(async () => ({ success: true, extractedCnicNumber: '12345-1234567-1', extractedName: 'Test', confidence: 95 }))
}));

describe('CNIC Integration', () => {
  it('get status for user and admin stats', async () => {
    const app = createTestApp();

    const u = await createTestUser({ email: `intcnic+${Date.now()}@example.com` });
    const userToken = generateTestToken(u);

    const statusRes = await request(app)
      .get('/api/cnic/status')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(statusRes.body.success).toBe(true);
    expect(statusRes.body.data.status).toBe('not_submitted');

    const admin = await createTestAdmin({ email: `intadmin+${Date.now()}@example.com` });
    const adminToken = generateTestToken(admin);

    const statsRes = await request(app)
      .get('/api/cnic/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(statsRes.body.success).toBe(true);
    expect(statsRes.body.data).toBeDefined();
  });
});