import express from 'express';
import { authenticate } from '../../core/middlewares/auth.middleware.js';
import validate from '../../core/middlewares/validate.middleware.js';
import {
  depositRateLimit,
  withdrawalRateLimit,
  paymentVerificationRateLimit,
  paymentRateLimit,
} from '../../core/middlewares/payment-rate-limit.middleware.js';
import * as paymentController from './payment.controller.js';
import * as paymentValidation from './payment.validation.js';

const router = express.Router();

/**
 * @swagger
 * /api/payments/callback/mock:
 *   get:
 *     summary: Mock payment callback (testing mode)
 *     tags: [Payments]
 *     parameters:
 *       - in: query
 *         name: transactionId
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Mock callback processed
 */
router.get('/callback/mock', paymentController.handleMockCallback);

/**
 * @swagger
 * /api/payments/mode:
 *   get:
 *     summary: Get payment mode (testing or production)
 *     tags: [Payments]
 *     responses:
 *       200:
 *         description: Current payment mode
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     mode:
 *                       type: string
 *                       enum: [testing, production]
 *                     isTesting:
 *                       type: boolean
 */
router.get('/mode', paymentController.getPaymentMode);

// All other routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/payments/methods:
 *   get:
 *     summary: Get available payment methods
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Available payment methods
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 methods:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       type:
 *                         type: string
 *       401:
 *         description: Not authenticated
 */
router.get('/methods', paymentController.getPaymentMethods);

/**
 * @swagger
 * /api/payments/wallet:
 *   get:
 *     summary: Get user wallet balance
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Wallet details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 wallet:
 *                   $ref: '#/components/schemas/Wallet'
 *       401:
 *         description: Not authenticated
 */
router.get('/wallet', paymentRateLimit, paymentController.getWallet);

/**
 * @swagger
 * /api/payments/deposit/initialize:
 *   post:
 *     summary: Initialize a deposit
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - paymentMethod
 *             properties:
 *               amount:
 *                 type: number
 *                 minimum: 100
 *               paymentMethod:
 *                 type: string
 *                 enum: [jazzcash, easypaisa, bank_transfer]
 *     responses:
 *       200:
 *         description: Deposit initialized
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 paymentUrl:
 *                   type: string
 *                 transactionId:
 *                   type: string
 *       401:
 *         description: Not authenticated
 *       429:
 *         description: Rate limit exceeded
 */
router.post(
  '/deposit/initialize',
  depositRateLimit,
  validate(paymentValidation.initializeDeposit),
  paymentController.initializeDeposit
);

/**
 * @swagger
 * /api/payments/deposit/verify:
 *   post:
 *     summary: Verify a deposit
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - transactionId
 *             properties:
 *               transactionId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Deposit verified
 *       401:
 *         description: Not authenticated
 *       400:
 *         description: Verification failed
 */
router.post(
  '/deposit/verify',
  paymentVerificationRateLimit,
  validate(paymentValidation.verifyDeposit),
  paymentController.verifyDeposit
);

/**
 * @swagger
 * /api/payments/transactions:
 *   get:
 *     summary: Get transaction history
 *     tags: [Payments]
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
 *           enum: [deposit, withdrawal, escrow_fund, escrow_release, escrow_refund]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, completed, failed]
 *     responses:
 *       200:
 *         description: Transaction history
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 transactions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Transaction'
 *       401:
 *         description: Not authenticated
 */
router.get(
  '/transactions',
  paymentRateLimit,
  validate(paymentValidation.getTransactions, 'query'),
  paymentController.getTransactions
);

/**
 * @swagger
 * /api/payments/withdrawals:
 *   post:
 *     summary: Create a withdrawal request
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - paymentMethod
 *               - accountDetails
 *             properties:
 *               amount:
 *                 type: number
 *                 minimum: 500
 *               paymentMethod:
 *                 type: string
 *                 enum: [jazzcash, easypaisa, bank_transfer]
 *               accountDetails:
 *                 type: object
 *                 properties:
 *                   accountNumber:
 *                     type: string
 *                   accountTitle:
 *                     type: string
 *                   bankName:
 *                     type: string
 *     responses:
 *       201:
 *         description: Withdrawal request created
 *       401:
 *         description: Not authenticated
 *       400:
 *         description: Insufficient balance or validation error
 *       429:
 *         description: Rate limit exceeded
 */
router.post(
  '/withdrawals',
  withdrawalRateLimit,
  validate(paymentValidation.createWithdrawal),
  paymentController.createWithdrawal
);

/**
 * @swagger
 * /api/payments/withdrawals:
 *   get:
 *     summary: Get user's withdrawal requests
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of withdrawals
 *       401:
 *         description: Not authenticated
 */
router.get(
  '/withdrawals',
  paymentController.getWithdrawals
);

/**
 * @swagger
 * /api/payments/withdrawals/{id}:
 *   get:
 *     summary: Get withdrawal by ID
 *     tags: [Payments]
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
 *         description: Withdrawal details
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Withdrawal not found
 */
router.get(
  '/withdrawals/:id',
  paymentController.getWithdrawal
);

/**
 * @swagger
 * /api/payments/withdrawals/{id}:
 *   delete:
 *     summary: Cancel a pending withdrawal
 *     tags: [Payments]
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
 *         description: Withdrawal cancelled
 *       401:
 *         description: Not authenticated
 *       400:
 *         description: Cannot cancel non-pending withdrawal
 *       404:
 *         description: Withdrawal not found
 */
router.delete(
  '/withdrawals/:id',
  paymentController.cancelWithdrawal
);

/**
 * @swagger
 * /api/payments/contracts/{contractId}/escrows:
 *   get:
 *     summary: Get escrows for a contract
 *     tags: [Payments]
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
 */
router.get(
  '/contracts/:contractId/escrows',
  paymentController.getContractEscrows
);

/**
 * @swagger
 * /api/payments/contracts/{contractId}/milestones/{milestoneId}/escrow:
 *   get:
 *     summary: Get escrow for a specific milestone
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: contractId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: milestoneId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Escrow details
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Escrow not found
 */
router.get(
  '/contracts/:contractId/milestones/:milestoneId/escrow',
  paymentController.getMilestoneEscrow
);

export default router;

