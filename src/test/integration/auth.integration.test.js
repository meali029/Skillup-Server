import request from 'supertest';

// Mock multer config to avoid import.meta in tests
jest.mock('../../config/multer.js', () => ({
  uploadCNIC: { fields: () => (req, res, next) => next() }
}));

import createTestApp from './createTestApp.js';
import { createTestUser } from '../utils.js';

describe('Auth Integration', () => {
  it('register, login, and get me', async () => {
    const app = createTestApp();

    // Register
    const email = `intuser+${Date.now()}@example.com`;
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Int User', email, password: 'password123' })
      .expect(201);

    expect(registerRes.body.success).toBe(true);
    expect(registerRes.body.data.user.email).toBe(email);
    expect(registerRes.body.data.token).toBeDefined();

    // Login
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'password123' })
      .expect(200);

    expect(loginRes.body.success).toBe(true);
    expect(loginRes.body.data.token).toBeDefined();
    const token = loginRes.body.data.token;

    // Get me with Bearer token
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(meRes.body.success).toBe(true);
    expect(meRes.body.data.user.email).toBe(email);
  });
});