import express from 'express';
import { authenticate, authorizeAdmin } from '../../../core/middlewares/auth.middleware.js';
import validate from '../../../core/middlewares/validate.middleware.js';
import * as paymentManagementController from './payment-management.controller.js';
import * as paymentValidation from '../../payments/payment.validation.js';

const router = express.Router();

// All routes require admin authentication
router.use(authenticate);
router.use(authorizeAdmin);

/**
 * @swagger
 * /api/admin/payments/transactions:
 *   get:
 *     summary: Get all transactions
 *     tags: [Admin - Payments]
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
 *         name: type
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of transactions
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.get('/transactions', paymentManagementController.getAllTransactions);

/**
 * @swagger
 * /api/admin/payments/withdrawals:
 *   get:
 *     summary: Get all withdrawals
 *     tags: [Admin - Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, processing, completed, rejected]
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
 *         description: List of withdrawals
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.get('/withdrawals', paymentManagementController.getAllWithdrawals);

/**
 * @swagger
 * /api/admin/payments/withdrawals/pending:
 *   get:
 *     summary: Get pending withdrawals
 *     tags: [Admin - Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of pending withdrawals
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.get('/withdrawals/pending', paymentManagementController.getPendingWithdrawals);

/**
 * @swagger
 * /api/admin/payments/withdrawals/{id}/process:
 *   post:
 *     summary: Process a withdrawal request
 *     tags: [Admin - Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               transactionReference:
 *                 type: string
 *     responses:
 *       200:
 *         description: Withdrawal processed
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 *       404:
 *         description: Withdrawal not found
 */
router.post(
  '/withdrawals/:id/process',
  paymentManagementController.processWithdrawal
);

/**
 * @swagger
 * /api/admin/payments/withdrawals/{id}/reject:
 *   post:
 *     summary: Reject a withdrawal request
 *     tags: [Admin - Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *         description: Withdrawal rejected
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 *       404:
 *         description: Withdrawal not found
 */
router.post(
  '/withdrawals/:id/reject',
  validate(paymentValidation.rejectWithdrawal),
  paymentManagementController.rejectWithdrawal
);

/**
 * @swagger
 * /api/admin/payments/escrows/{id}:
 *   get:
 *     summary: Get escrow details
 *     tags: [Admin - Payments]
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
 *         description: Escrow details
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 *       404:
 *         description: Escrow not found
 */
router.get('/escrows/:id', paymentManagementController.getEscrowDetails);

/**
 * @swagger
 * /api/admin/payments/contracts/{contractId}/escrows:
 *   get:
 *     summary: Get escrows for a contract
 *     tags: [Admin - Payments]
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
 *         description: List of escrows
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.get('/contracts/:contractId/escrows', paymentManagementController.getContractEscrows);

/**
 * @swagger
 * /api/admin/payments/escrows/{id}/release:
 *   post:
 *     summary: Manually release escrow
 *     tags: [Admin - Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Escrow released
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 *       404:
 *         description: Escrow not found
 */
router.post(
  '/escrows/:id/release',
  validate(paymentValidation.adminReleaseEscrow),
  paymentManagementController.manualEscrowRelease
);

/**
 * @swagger
 * /api/admin/payments/escrows/{id}/refund:
 *   post:
 *     summary: Manually refund escrow
 *     tags: [Admin - Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Escrow refunded
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 *       404:
 *         description: Escrow not found
 */
router.post(
  '/escrows/:id/refund',
  validate(paymentValidation.adminRefundEscrow),
  paymentManagementController.manualEscrowRefund
);

/**
 * @swagger
 * /api/admin/payments/mode:
 *   get:
 *     summary: Get payment mode (test/live)
 *     tags: [Admin - Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Payment mode
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 mode:
 *                   type: string
 *                   enum: [test, live]
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.get('/mode', paymentManagementController.getPaymentMode);

/**
 * @swagger
 * /api/admin/payments/mode:
 *   post:
 *     summary: Update payment mode
 *     tags: [Admin - Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - mode
 *             properties:
 *               mode:
 *                 type: string
 *                 enum: [test, live]
 *     responses:
 *       200:
 *         description: Payment mode updated
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.post('/mode', paymentManagementController.updatePaymentMode);

export default router;

