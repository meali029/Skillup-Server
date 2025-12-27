import request from 'supertest';
import app from '../../app.js';

describe('app health endpoints', () => {
  it('GET /health returns status healthy', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('healthy');
  });

  it('GET /api returns API info', async () => {
    const res = await request(app).get('/api').expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.endpoints).toBeDefined();
  });

  it('root / returns operational', async () => {
    const res = await request(app).get('/').expect(200);
    expect(res.body.message).toMatch(/Server is running/);
  });


});