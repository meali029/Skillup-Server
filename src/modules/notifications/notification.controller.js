import asyncHandler from '../../core/utils/asyncHandler.js';
import { successResponse } from '../../core/utils/responseFormatter.js';
import * as notificationService from './notification.service.js';

export const getMyNotifications = asyncHandler(async (req, res) => {
  const { unreadOnly, limit, page } = req.query;
  const result = await notificationService.listMyNotifications(req.user.id, {
    unreadOnly: unreadOnly === 'true',
    limit: limit ? parseInt(limit) : 50,
    page: page ? parseInt(page) : 1,
  });
  successResponse(res, result, 'Notifications fetched successfully');
});

export const getMyUnreadCount = asyncHandler(async (req, res) => {
  const count = await notificationService.getUnreadCount(req.user.id);
  successResponse(res, { count }, 'Unread count fetched successfully');
});

export const markNotificationRead = asyncHandler(async (req, res) => {
  const updated = await notificationService.markRead(req.user.id, req.params.id);
  successResponse(res, { notification: updated }, 'Notification marked as read');
});

export const markAllNotificationsRead = asyncHandler(async (req, res) => {
  await notificationService.markAllRead(req.user.id);
  successResponse(res, {}, 'All notifications marked as read');
});

export const deleteNotification = asyncHandler(async (req, res) => {
  const deleted = await notificationService.deleteNotification(req.user.id, req.params.id);
  if (!deleted) {
    return res.status(404).json({ success: false, message: 'Notification not found' });
  }
  successResponse(res, { notification: deleted }, 'Notification deleted successfully');
});

export const deleteAllNotifications = asyncHandler(async (req, res) => {
  const result = await notificationService.deleteAllNotifications(req.user.id);
  successResponse(res, { deletedCount: result.deletedCount }, 'All notifications deleted successfully');
});