import express from 'express';
import {
  createDispute,
  getAllDisputes,
  getDisputeById,
  getDisputesByContract,
  resolveDispute,
  rejectDispute,
  addAdminNote,
  getDisputeStats,
  updateDisputeStatus,
} from './dispute.controller.js';
import { authenticate, authorizeAdmin } from '../../core/middlewares/index.js';

const router = express.Router();

/**
 * @swagger
 * /api/disputes:
 *   post:
 *     summary: Create a new dispute
 *     tags: [Disputes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - contractId
 *               - reason
 *               - description
 *             properties:
 *               contractId:
 *                 type: string
 *               reason:
 *                 type: string
 *                 enum: [payment_issue, quality_issue, deadline_missed, communication, other]
 *               description:
 *                 type: string
 *               evidence:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Dispute created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 dispute:
 *                   $ref: '#/components/schemas/Dispute'
 *       401:
 *         description: Not authenticated
 *       400:
 *         description: Validation error
 */
router.post('/', authenticate, createDispute);

/**
 * @swagger
 * /api/disputes/contract/{contractId}:
 *   get:
 *     summary: Get disputes for a contract
 *     tags: [Disputes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: contractId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of disputes for the contract
 *       401:
 *         description: Not authenticated
 */
router.get('/contract/:contractId', authenticate, getDisputesByContract);

/**
 * @swagger
 * /api/disputes:
 *   get:
 *     summary: Get all disputes (Admin)
 *     tags: [Disputes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, under_review, resolved, rejected]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of all disputes
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.get('/', authenticate, authorizeAdmin, getAllDisputes);

/**
 * @swagger
 * /api/disputes/stats:
 *   get:
 *     summary: Get dispute statistics (Admin)
 *     tags: [Disputes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dispute statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 stats:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     open:
 *                       type: integer
 *                     resolved:
 *                       type: integer
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.get('/stats', authenticate, authorizeAdmin, getDisputeStats);

/**
 * @swagger
 * /api/disputes/{disputeId}:
 *   get:
 *     summary: Get dispute by ID (Admin)
 *     tags: [Disputes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: disputeId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Dispute details
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 *       404:
 *         description: Dispute not found
 */
router.get('/:disputeId', authenticate, authorizeAdmin, getDisputeById);

/**
 * @swagger
 * /api/disputes/{disputeId}/resolve:
 *   post:
 *     summary: Resolve a dispute (Admin)
 *     tags: [Disputes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: disputeId
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
 *               - resolution
 *             properties:
 *               resolution:
 *                 type: string
 *               refundAmount:
 *                 type: number
 *     responses:
 *       200:
 *         description: Dispute resolved
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.post('/:disputeId/resolve', authenticate, authorizeAdmin, resolveDispute);

/**
 * @swagger
 * /api/disputes/{disputeId}/reject:
 *   post:
 *     summary: Reject a dispute (Admin)
 *     tags: [Disputes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: disputeId
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
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Dispute rejected
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.post('/:disputeId/reject', authenticate, authorizeAdmin, rejectDispute);

/**
 * @swagger
 * /api/disputes/{disputeId}/notes:
 *   post:
 *     summary: Add admin note to dispute (Admin)
 *     tags: [Disputes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: disputeId
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
 *               - note
 *             properties:
 *               note:
 *                 type: string
 *     responses:
 *       200:
 *         description: Note added
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.post('/:disputeId/notes', authenticate, authorizeAdmin, addAdminNote);

/**
 * @swagger
 * /api/disputes/{disputeId}/status:
 *   patch:
 *     summary: Update dispute status (Admin)
 *     tags: [Disputes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: disputeId
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
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [open, under_review, resolved, rejected]
 *     responses:
 *       200:
 *         description: Status updated
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.patch('/:disputeId/status', authenticate, authorizeAdmin, updateDisputeStatus);

export default router;
