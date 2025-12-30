import express from 'express';
import * as messageController from './message.controller.js';
import { authenticate } from '../../core/middlewares/auth.middleware.js';
import validate from '../../core/middlewares/validate.middleware.js';
import * as messageValidation from './message.validation.js';
import upload from '../../core/middlewares/upload.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get unread count
router.get('/unread-count', messageController.getUnreadCount);

// Conversation routes
router.post(
  '/conversations',
  validate(messageValidation.createConversation),
  messageController.createConversation
);

router.get(
  '/conversations',
  validate(messageValidation.getConversations),
  messageController.getConversations
);

router.get(
  '/conversations/:id',
  validate(messageValidation.getConversation),
  messageController.getConversation
);

router.post(
  '/conversations/:id/archive',
  validate(messageValidation.archiveConversation),
  messageController.archiveConversation
);

router.post(
  '/conversations/:id/unarchive',
  validate(messageValidation.archiveConversation),
  messageController.unarchiveConversation
);

router.post(
  '/conversations/:id/pin',
  validate(messageValidation.archiveConversation),
  messageController.pinConversation
);

router.post(
  '/conversations/:id/unpin',
  validate(messageValidation.archiveConversation),
  messageController.unpinConversation
);

router.post(
  '/conversations/:id/mute',
  validate(messageValidation.archiveConversation),
  messageController.muteConversation
);

router.post(
  '/conversations/:id/unmute',
  validate(messageValidation.archiveConversation),
  messageController.unmuteConversation
);

router.delete(
  '/conversations/:id',
  validate(messageValidation.archiveConversation),
  messageController.deleteConversation
);

// Message routes
router.post(
  '/conversations/:conversationId/messages',
  upload.array('attachments', 5),
  validate(messageValidation.sendMessage),
  messageController.sendMessage
);

router.get(
  '/conversations/:conversationId/messages',
  validate(messageValidation.getMessages),
  messageController.getMessages
);

router.post(
  '/conversations/:conversationId/read',
  validate(messageValidation.markAsRead),
  messageController.markAsRead
);

router.patch(
  '/conversations/:conversationId/messages/:messageId',
  validate(messageValidation.editMessage),
  messageController.editMessage
);

router.delete(
  '/conversations/:conversationId/messages/:messageId',
  validate(messageValidation.deleteMessage),
  messageController.deleteMessage
);

router.get(
  '/conversations/:conversationId/search',
  validate(messageValidation.searchMessages),
  messageController.searchMessages
);

export default router;
