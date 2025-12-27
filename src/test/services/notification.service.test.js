import { describe, it, expect, beforeEach } from '@jest/globals';
import NotificationService, { notifyUser, notifyAdmins, listMyNotifications, markRead, markAllRead, getUnreadCount, deleteNotification, deleteAllNotifications } from '../../modules/notifications/notification.service.js';
import User from '../../models/User.js';
import Notification from '../../models/Notification.js';

// Mock socket emitters
import * as sockets from '../../sockets/index.js';
jest.mock('../../sockets/index.js', () => ({
  emitUserNotification: jest.fn(),
  emitToRoom: jest.fn(),
}));

describe('Notification Service', () => {
  beforeEach(async () => {
    // Clear mocks
    sockets.emitUserNotification.mockClear();
    sockets.emitToRoom.mockClear();
  });

  it('notifyUser creates a notification and emits to user', async () => {
    const u = await User.create({ name: 'NotifyU', email: 'notifyu@example.com' });

    const payload = { type: 'info', title: 'T', message: 'M', link: '/x' };
    const doc = await notifyUser(u._id, payload);

    expect(doc).toBeDefined();
    expect(doc.userId.toString()).toBe(u._id.toString());
    expect(sockets.emitUserNotification).toHaveBeenCalled();
  });

  it('notifyAdmins emits to room when no admins persisted', async () => {
    // ensure no admin users exist
    const res = await notifyAdmins({ type: 'info', title: 'Admin', message: 'm' });
    expect(res).toEqual([]);
    expect(sockets.emitToRoom).toHaveBeenCalledWith('admins', 'notification', expect.any(Object));
  });

  it('notifyAdmins inserts docs and returns admin ids', async () => {
    const a1 = await User.create({ name: 'A1', email: 'a1@ex.com', role: 'admin', adminRole: 'admin' });
    const a2 = await User.create({ name: 'A2', email: 'a2@ex.com', role: 'admin', adminRole: 'admin' });

    const result = await notifyAdmins({ type: 'alert', message: 'x' });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(sockets.emitToRoom).toHaveBeenCalledWith('admins', 'notification', expect.any(Object));
  });

  it('listMyNotifications and markRead/markAllRead/getUnreadCount work', async () => {
    const u = await User.create({ name: 'NL', email: 'nl@example.com' });
    await notifyUser(u._id, { type: 'info', title: 't1', message: 'm1' });
    await notifyUser(u._id, { type: 'info', title: 't2', message: 'm2' });

    const list = await listMyNotifications(u._id, { unreadOnly: true });
    expect(list.items.length).toBe(2);

    const first = list.items[0];
    const afterMark = await markRead(u._id, first._id);
    expect(afterMark.isRead).toBe(true);

    const countBefore = await getUnreadCount(u._id);
    await markAllRead(u._id);
    const countAfter = await getUnreadCount(u._id);
    expect(countAfter).toBe(0);
  });

  it('deleteNotification and deleteAllNotifications work', async () => {
    const u = await User.create({ name: 'DL', email: 'dl@example.com' });
    const n1 = await notifyUser(u._id, { type: 'info', title: 't1', message: 'm1' });
    const n2 = await notifyUser(u._id, { type: 'info', title: 't2', message: 'm2' });

    const res = await deleteNotification(u._id, n1._id);
    expect(res).toBeDefined();

    await deleteAllNotifications(u._id);
    const remaining = await Notification.find({ userId: u._id });
    expect(remaining.length).toBe(0);
  });
});