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

// Public routes (authenticated users)
router.post('/', authenticate, createDispute);
router.get('/contract/:contractId', authenticate, getDisputesByContract);

// Admin routes
router.get('/', authenticate, authorizeAdmin, getAllDisputes);
router.get('/stats', authenticate, authorizeAdmin, getDisputeStats);
router.get('/:disputeId', authenticate, authorizeAdmin, getDisputeById);
router.post('/:disputeId/resolve', authenticate, authorizeAdmin, resolveDispute);
router.post('/:disputeId/reject', authenticate, authorizeAdmin, rejectDispute);
router.post('/:disputeId/notes', authenticate, authorizeAdmin, addAdminNote);
router.patch('/:disputeId/status', authenticate, authorizeAdmin, updateDisputeStatus);

export default router;
