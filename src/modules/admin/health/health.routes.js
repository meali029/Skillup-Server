import express from 'express';
import { authenticate, authorizeAdmin } from '../../../core/middlewares/index.js';
import {
  getSystemHealth,
  getAIHealth,
  getCircuitBreakerStats,
  resetCircuitBreaker,
  getHealthDashboard,
} from './health.controller.js';

const router = express.Router();

// All routes require admin authentication
router.use(authenticate);
router.use(authorizeAdmin);

// Health monitoring endpoints
router.get('/system', getSystemHealth);
router.get('/ai', getAIHealth);
router.get('/circuit-breaker', getCircuitBreakerStats);
router.post('/circuit-breaker/reset', resetCircuitBreaker);
router.get('/dashboard', getHealthDashboard);

export default router;
