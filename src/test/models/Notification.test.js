import { describe, it, expect } from '@jest/globals';
import User from '../../models/User.js';
import Notification from '../../models/Notification.js';

describe('Notification Model', () => {
  it('creates a notification and applies defaults', async () => {
    const user = await User.create({ name: 'Notify User', email: 'notify@example.com' });

    const n = await Notification.create({
      userId: user._id,
      type: 'info',
      title: 'Hello',
      message: 'This is a test notification',
      link: '/test',
    });

    expect(n).toBeDefined();
    expect(n.userId.toString()).toBe(user._id.toString());
    expect(n.type).toBe('info');
    expect(n.message).toBe('This is a test notification');
    expect(n.isRead).toBe(false);
    expect(n.createdAt).toBeDefined();
  });
});