import express from 'express';
import { authenticate, authorizeAdmin } from '../../core/middlewares/index.js';
import {
  getAdminSettings,
  updateAdminSettings,
  getAIFeatureStatus,
  getAIHealthStats,
  resetAICircuitBreaker,
  sendEmailTest,
} from './admin.settings.controller.js';

const router = express.Router();

// All routes require admin authentication
router.use(authenticate);
router.use(authorizeAdmin);

/**
 * @swagger
 * /api/admin/settings:
 *   get:
 *     summary: Get admin settings
 *     tags: [Admin - Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Admin settings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 settings:
 *                   type: object
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.get('/', getAdminSettings);

/**
 * @swagger
 * /api/admin/settings:
 *   put:
 *     summary: Update admin settings
 *     tags: [Admin - Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               aiEnabled:
 *                 type: boolean
 *               maintenanceMode:
 *                 type: boolean
 *               maxUploadSize:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Settings updated
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.put('/', updateAdminSettings);

/**
 * @swagger
 * /api/admin/settings/ai-status:
 *   get:
 *     summary: Get AI feature status
 *     tags: [Admin - Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: AI feature status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 aiEnabled:
 *                   type: boolean
 *                 features:
 *                   type: object
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.get('/ai-status', getAIFeatureStatus);

/**
 * @swagger
 * /api/admin/settings/ai-health:
 *   get:
 *     summary: Get AI health and circuit breaker stats
 *     tags: [Admin - Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: AI health statistics
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
 *                     isHealthy:
 *                       type: boolean
 *                     circuitBreakerState:
 *                       type: string
 *                     failureCount:
 *                       type: integer
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.get('/ai-health', getAIHealthStats);

/**
 * @swagger
 * /api/admin/settings/ai-reset-circuit:
 *   post:
 *     summary: Reset AI circuit breaker
 *     tags: [Admin - Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Circuit breaker reset
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.post('/ai-reset-circuit', resetAICircuitBreaker);

/**
 * @swagger
 * /api/admin/settings/email-test:
 *   post:
 *     summary: Send a test email through the active provider
 *     tags: [Admin - Settings]
 *     security:
 *       - bearerAuth: []
 */
router.post('/email-test', sendEmailTest);

export default router;



