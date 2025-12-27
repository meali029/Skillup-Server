import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import * as NotificationController from '../../modules/notifications/notification.controller.js';
import User from '../../models/User.js';

jest.mock('../../modules/notifications/notification.service.js', () => ({
  listMyNotifications: jest.fn(),
  getUnreadCount: jest.fn(),
  markRead: jest.fn(),
  markAllRead: jest.fn(),
  deleteNotification: jest.fn(),
  deleteAllNotifications: jest.fn(),
}));

import * as notificationService from '../../modules/notifications/notification.service.js';

const buildRes = () => {
  const res = {};
  res.status = jest.fn((code) => { res.statusCode = code; return res; });
  res.json = jest.fn((payload) => { res.payload = payload; return res; });
  return res;
};

describe('Notification Controller', () => {
  beforeEach(async () => {
    await User.deleteMany({});
    jest.clearAllMocks();
  });

  it('getMyNotifications calls service and returns result', async () => {
    const u = await User.create({ name: 'N', email: 'n@ex.com' });
    notificationService.listMyNotifications.mockResolvedValue({ items: [], pagination: { page:1 } });

    const req = { user: { id: u._id }, query: { page: '1' } };
    const res = buildRes();

    await NotificationController.getMyNotifications(req, res);
    expect(notificationService.listMyNotifications).toHaveBeenCalledWith(u._id, expect.any(Object));
  });

  it('markNotificationRead and deleteNotification behavior', async () => {
    const u = await User.create({ name: 'N2', email: 'n2@ex.com' });
    notificationService.markRead.mockResolvedValue({ _id: 'n1', isRead: true });
    notificationService.deleteNotification.mockResolvedValue({ _id: 'n1' });

    const req = { user: { id: u._id }, params: { id: 'n1' } };
    const res = buildRes();

    await NotificationController.markNotificationRead(req, res);
    expect(notificationService.markRead).toHaveBeenCalledWith(u._id, 'n1');
    expect(res.payload.data.notification.isRead).toBe(true);

    // delete
    const res2 = buildRes();
    await NotificationController.deleteNotification(req, res2);
    expect(notificationService.deleteNotification).toHaveBeenCalledWith(u._id, 'n1');
    expect(res2.payload.data.notification._id).toBe('n1');
  });

  it('deleteAllNotifications returns deletedCount', async () => {
    const u = await User.create({ name: 'N3', email: 'n3@ex.com' });
    notificationService.deleteAllNotifications.mockResolvedValue({ deletedCount: 2 });

    const req = { user: { id: u._id } };
    const res = buildRes();

    await NotificationController.deleteAllNotifications(req, res);
    expect(res.payload.data.deletedCount).toBe(2);
  });
});