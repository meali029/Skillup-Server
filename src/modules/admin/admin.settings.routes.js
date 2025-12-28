import express from 'express';
import { authenticate, authorizeAdmin } from '../../core/middlewares/index.js';
import {
  getAdminSettings,
  updateAdminSettings,
  getAIFeatureStatus,
  getAIHealthStats,
  resetAICircuitBreaker,
} from './admin.settings.controller.js';

const router = express.Router();

// All routes require admin authentication
router.use(authenticate);
router.use(authorizeAdmin);

// Get admin settings
router.get('/', getAdminSettings);

// Update admin settings
router.put('/', updateAdminSettings);

// Get AI feature status (public endpoint for checking if AI is enabled)
router.get('/ai-status', getAIFeatureStatus);

// Get AI health and circuit breaker stats (admin only)
router.get('/ai-health', getAIHealthStats);

// Reset AI circuit breaker (admin only)
router.post('/ai-reset-circuit', resetAICircuitBreaker);

export default router;




