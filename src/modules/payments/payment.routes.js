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

// Mock payment callback (public route for testing mode)
router.get('/callback/mock', paymentController.handleMockCallback);

// All other routes require authentication
router.use(authenticate);

// Payment methods and limits
router.get('/methods', paymentController.getPaymentMethods);

// Wallet operations
router.get('/wallet', paymentRateLimit, paymentController.getWallet);

// Deposit operations
router.post(
  '/deposit/initialize',
  depositRateLimit,
  validate(paymentValidation.initializeDeposit),
  paymentController.initializeDeposit
);

router.post(
  '/deposit/verify',
  paymentVerificationRateLimit,
  validate(paymentValidation.verifyDeposit),
  paymentController.verifyDeposit
);

// Transaction history
router.get(
  '/transactions',
  paymentRateLimit,
  validate(paymentValidation.getTransactions, 'query'),
  paymentController.getTransactions
);

// Withdrawal operations
router.post(
  '/withdrawals',
  withdrawalRateLimit,
  validate(paymentValidation.createWithdrawal),
  paymentController.createWithdrawal
);

router.get(
  '/withdrawals',
  paymentController.getWithdrawals
);

router.get(
  '/withdrawals/:id',
  paymentController.getWithdrawal
);

router.delete(
  '/withdrawals/:id',
  paymentController.cancelWithdrawal
);

// Escrow operations
router.get(
  '/contracts/:contractId/escrows',
  paymentController.getContractEscrows
);

router.get(
  '/contracts/:contractId/milestones/:milestoneId/escrow',
  paymentController.getMilestoneEscrow
);

export default router;

