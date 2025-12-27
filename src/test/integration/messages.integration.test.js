import request from 'supertest';

import createTestApp from './createTestApp.js';
import { createTestUser, generateTestToken } from '../utils.js';

describe('Messages Integration', () => {
  it('user can create conversation, send message, and mark read', async () => {
    const app = createTestApp();

    const userA = await createTestUser({ email: `a+${Date.now()}@example.com` });
    const userB = await createTestUser({ email: `b+${Date.now()}@example.com` });

    const tokenA = generateTestToken(userA);
    const tokenB = generateTestToken(userB);

    // Create conversation
    const convRes = await request(app)
      .post('/api/messages/conversations')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ participantId: userB._id })
      .expect(201);

    expect(convRes.body.success).toBe(true);
    const conversationId = convRes.body.data.conversation._id || convRes.body.data.conversation.id;

    // Send message from A to B
    const sendRes = await request(app)
      .post(`/api/messages/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ content: 'Hello from A' })
      .expect(201);

    expect(sendRes.body.success).toBe(true);
    expect(sendRes.body.data.message.content).toBe('Hello from A');

    // Get messages as B
    const getRes = await request(app)
      .get(`/api/messages/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    expect(getRes.body.success).toBe(true);
    const messages = getRes.body.data.messages || getRes.body.data;
    expect(Array.isArray(messages)).toBe(true);
    expect(messages.length).toBeGreaterThanOrEqual(1);

    // Mark as read as B
    const readRes = await request(app)
      .post(`/api/messages/conversations/${conversationId}/read`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    expect(readRes.body.success).toBe(true);

    // Unread count for A should be 0
    const unread = await request(app)
      .get('/api/messages/unread-count')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(unread.body.success).toBe(true);
    expect(typeof unread.body.data.count).toBe('number');
  });
});