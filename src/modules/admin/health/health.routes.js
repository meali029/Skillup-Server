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

/**
 * @swagger
 * /api/admin/health/system:
 *   get:
 *     summary: Get system health status
 *     tags: [Admin - Health]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: System health status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 health:
 *                   type: object
 *                   properties:
 *                     database:
 *                       type: object
 *                     memory:
 *                       type: object
 *                     uptime:
 *                       type: number
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.get('/system', getSystemHealth);

/**
 * @swagger
 * /api/admin/health/ai:
 *   get:
 *     summary: Get AI service health status
 *     tags: [Admin - Health]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: AI service health
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 aiHealth:
 *                   type: object
 *                   properties:
 *                     isHealthy:
 *                       type: boolean
 *                     lastCheck:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.get('/ai', getAIHealth);

/**
 * @swagger
 * /api/admin/health/circuit-breaker:
 *   get:
 *     summary: Get circuit breaker statistics
 *     tags: [Admin - Health]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Circuit breaker stats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 circuitBreaker:
 *                   type: object
 *                   properties:
 *                     state:
 *                       type: string
 *                       enum: [closed, open, half-open]
 *                     failures:
 *                       type: integer
 *                     lastFailure:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.get('/circuit-breaker', getCircuitBreakerStats);

/**
 * @swagger
 * /api/admin/health/circuit-breaker/reset:
 *   post:
 *     summary: Reset circuit breaker
 *     tags: [Admin - Health]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Circuit breaker reset successfully
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.post('/circuit-breaker/reset', resetCircuitBreaker);

/**
 * @swagger
 * /api/admin/health/dashboard:
 *   get:
 *     summary: Get health dashboard overview
 *     tags: [Admin - Health]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Health dashboard data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 dashboard:
 *                   type: object
 *                   properties:
 *                     system:
 *                       type: object
 *                     ai:
 *                       type: object
 *                     database:
 *                       type: object
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.get('/dashboard', getHealthDashboard);

export default router;
