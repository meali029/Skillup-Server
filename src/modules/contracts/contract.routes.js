import express from 'express';
import * as contractController from './contract.controller.js';
import { authenticate } from '../../core/middlewares/auth.middleware.js';
import validate from '../../core/middlewares/validate.middleware.js';
import * as contractValidation from './contract.validation.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get contract statistics
router.get('/stats/me', contractController.getMyStats);

// Create contract from proposal
router.post(
  '/from-proposal',
  validate(contractValidation.createFromProposal),
  contractController.createFromProposal
);

// Get all contracts for user
router.get(
  '/',
  validate(contractValidation.queryContracts),
  contractController.getMyContracts
);

// Get contract by ID
router.get(
  '/:id',
  validate(contractValidation.getContract),
  contractController.getContract
);

// Accept or decline contract
router.post(
  '/:id/respond',
  validate(contractValidation.respondToContract),
  contractController.respondToContract
);

// Add milestone
router.post(
  '/:id/milestones',
  validate(contractValidation.addMilestone),
  contractController.addMilestone
);

// Update milestone
router.patch(
  '/:id/milestones/:milestoneId',
  validate(contractValidation.updateMilestone),
  contractController.updateMilestone
);

// Complete contract
router.post(
  '/:id/complete',
  validate(contractValidation.getContract),
  contractController.completeContract
);

// Cancel contract
router.post(
  '/:id/cancel',
  validate(contractValidation.cancelContract),
  contractController.cancelContract
);

// Fund milestone escrow
router.post(
  '/:id/milestones/:milestoneId/fund',
  validate(contractValidation.fundMilestoneEscrow),
  contractController.fundMilestoneEscrow
);

// Approve milestone and release escrow
router.post(
  '/:id/milestones/:milestoneId/approve',
  validate(contractValidation.approveMilestone),
  contractController.approveMilestone
);

// Verify contract payment
router.post(
  '/:id/verify-payment',
  contractController.verifyContractPayment
);

export default router;
