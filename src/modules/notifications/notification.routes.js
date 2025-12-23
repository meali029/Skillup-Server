import express from 'express';
import { authenticate } from '../../core/middlewares/index.js';
import {
  getMyNotifications,
  getMyUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  deleteAllNotifications,
} from './notification.controller.js';

const router = express.Router();

router.use(authenticate);

router.get('/', getMyNotifications);
router.get('/unread-count', getMyUnreadCount);
router.patch('/:id/read', markNotificationRead);
router.patch('/mark-all-read', markAllNotificationsRead);
router.patch('/read-all', markAllNotificationsRead); // Legacy route for backward compatibility
router.delete('/:id', deleteNotification);
router.delete('/', deleteAllNotifications);

export default router;
