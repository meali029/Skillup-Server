import express from 'express';
import { authenticate, authorizeAdmin } from '../../../core/middlewares/auth.middleware.js';
import validate from '../../../core/middlewares/validate.middleware.js';
import * as paymentManagementController from './payment-management.controller.js';
import * as paymentValidation from '../../payments/payment.validation.js';

const router = express.Router();

// All routes require admin authentication
router.use(authenticate);
router.use(authorizeAdmin);

// Transactions
router.get('/transactions', paymentManagementController.getAllTransactions);

// Withdrawals
router.get('/withdrawals', paymentManagementController.getAllWithdrawals);
router.get('/withdrawals/pending', paymentManagementController.getPendingWithdrawals);
router.post(
  '/withdrawals/:id/process',
  paymentManagementController.processWithdrawal
);
router.post(
  '/withdrawals/:id/reject',
  validate(paymentValidation.rejectWithdrawal),
  paymentManagementController.rejectWithdrawal
);

// Escrows
router.get('/escrows/:id', paymentManagementController.getEscrowDetails);
router.get('/contracts/:contractId/escrows', paymentManagementController.getContractEscrows);
router.post(
  '/escrows/:id/release',
  validate(paymentValidation.adminReleaseEscrow),
  paymentManagementController.manualEscrowRelease
);
router.post(
  '/escrows/:id/refund',
  validate(paymentValidation.adminRefundEscrow),
  paymentManagementController.manualEscrowRefund
);

// Payment mode
router.get('/mode', paymentManagementController.getPaymentMode);
router.post('/mode', paymentManagementController.updatePaymentMode);

export default router;

