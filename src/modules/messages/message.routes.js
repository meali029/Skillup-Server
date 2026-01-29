import express from 'express';
import * as messageController from './message.controller.js';
import { authenticate } from '../../core/middlewares/auth.middleware.js';
import validate from '../../core/middlewares/validate.middleware.js';
import * as messageValidation from './message.validation.js';
import upload from '../../core/middlewares/upload.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/messages/unread-count:
 *   get:
 *     summary: Get unread messages count
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unread count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *       401:
 *         description: Not authenticated
 */
router.get('/unread-count', messageController.getUnreadCount);

/**
 * @swagger
 * /api/messages/conversations:
 *   post:
 *     summary: Create a new conversation
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - participantId
 *             properties:
 *               participantId:
 *                 type: string
 *               contractId:
 *                 type: string
 *               initialMessage:
 *                 type: string
 *     responses:
 *       201:
 *         description: Conversation created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 conversation:
 *                   $ref: '#/components/schemas/Conversation'
 *       401:
 *         description: Not authenticated
 */
router.post(
  '/conversations',
  validate(messageValidation.createConversation),
  messageController.createConversation
);

/**
 * @swagger
 * /api/messages/conversations:
 *   get:
 *     summary: Get all conversations
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: archived
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: List of conversations
 *       401:
 *         description: Not authenticated
 */
router.get(
  '/conversations',
  validate(messageValidation.getConversations),
  messageController.getConversations
);

/**
 * @swagger
 * /api/messages/conversations/{id}:
 *   get:
 *     summary: Get conversation by ID
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Conversation details
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Conversation not found
 */
router.get(
  '/conversations/:id',
  validate(messageValidation.getConversation),
  messageController.getConversation
);

/**
 * @swagger
 * /api/messages/conversations/{id}/archive:
 *   post:
 *     summary: Archive a conversation
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Conversation archived
 *       401:
 *         description: Not authenticated
 */
router.post(
  '/conversations/:id/archive',
  validate(messageValidation.archiveConversation),
  messageController.archiveConversation
);

/**
 * @swagger
 * /api/messages/conversations/{id}/unarchive:
 *   post:
 *     summary: Unarchive a conversation
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Conversation unarchived
 *       401:
 *         description: Not authenticated
 */
router.post(
  '/conversations/:id/unarchive',
  validate(messageValidation.archiveConversation),
  messageController.unarchiveConversation
);

/**
 * @swagger
 * /api/messages/conversations/{id}/pin:
 *   post:
 *     summary: Pin a conversation
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Conversation pinned
 *       401:
 *         description: Not authenticated
 */
router.post(
  '/conversations/:id/pin',
  validate(messageValidation.archiveConversation),
  messageController.pinConversation
);

/**
 * @swagger
 * /api/messages/conversations/{id}/unpin:
 *   post:
 *     summary: Unpin a conversation
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Conversation unpinned
 *       401:
 *         description: Not authenticated
 */
router.post(
  '/conversations/:id/unpin',
  validate(messageValidation.archiveConversation),
  messageController.unpinConversation
);

/**
 * @swagger
 * /api/messages/conversations/{id}/mute:
 *   post:
 *     summary: Mute a conversation
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Conversation muted
 *       401:
 *         description: Not authenticated
 */
router.post(
  '/conversations/:id/mute',
  validate(messageValidation.archiveConversation),
  messageController.muteConversation
);

/**
 * @swagger
 * /api/messages/conversations/{id}/unmute:
 *   post:
 *     summary: Unmute a conversation
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Conversation unmuted
 *       401:
 *         description: Not authenticated
 */
router.post(
  '/conversations/:id/unmute',
  validate(messageValidation.archiveConversation),
  messageController.unmuteConversation
);

/**
 * @swagger
 * /api/messages/conversations/{id}:
 *   delete:
 *     summary: Delete a conversation
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Conversation deleted
 *       401:
 *         description: Not authenticated
 */
router.delete(
  '/conversations/:id',
  validate(messageValidation.archiveConversation),
  messageController.deleteConversation
);

/**
 * @swagger
 * /api/messages/conversations/{conversationId}/messages:
 *   post:
 *     summary: Send a message
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *               attachments:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       201:
 *         description: Message sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   $ref: '#/components/schemas/Message'
 *       401:
 *         description: Not authenticated
 */
router.post(
  '/conversations/:conversationId/messages',
  upload.array('attachments', 5),
  validate(messageValidation.sendMessage),
  messageController.sendMessage
);

/**
 * @swagger
 * /api/messages/conversations/{conversationId}/messages:
 *   get:
 *     summary: Get messages in a conversation
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: before
 *         schema:
 *           type: string
 *         description: Message ID to load messages before
 *     responses:
 *       200:
 *         description: List of messages
 *       401:
 *         description: Not authenticated
 */
router.get(
  '/conversations/:conversationId/messages',
  validate(messageValidation.getMessages),
  messageController.getMessages
);

/**
 * @swagger
 * /api/messages/conversations/{conversationId}/read:
 *   post:
 *     summary: Mark messages as read
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Messages marked as read
 *       401:
 *         description: Not authenticated
 */
router.post(
  '/conversations/:conversationId/read',
  validate(messageValidation.markAsRead),
  messageController.markAsRead
);

/**
 * @swagger
 * /api/messages/conversations/{conversationId}/messages/{messageId}:
 *   patch:
 *     summary: Edit a message
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *     responses:
 *       200:
 *         description: Message edited
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not message owner
 */
router.patch(
  '/conversations/:conversationId/messages/:messageId',
  validate(messageValidation.editMessage),
  messageController.editMessage
);

/**
 * @swagger
 * /api/messages/conversations/{conversationId}/messages/{messageId}:
 *   delete:
 *     summary: Delete a message
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Message deleted
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not message owner
 */
router.delete(
  '/conversations/:conversationId/messages/:messageId',
  validate(messageValidation.deleteMessage),
  messageController.deleteMessage
);

/**
 * @swagger
 * /api/messages/conversations/{conversationId}/search:
 *   get:
 *     summary: Search messages in a conversation
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
 *     responses:
 *       200:
 *         description: Search results
 *       401:
 *         description: Not authenticated
 */
router.get(
  '/conversations/:conversationId/search',
  validate(messageValidation.searchMessages),
  messageController.searchMessages
);

export default router;
