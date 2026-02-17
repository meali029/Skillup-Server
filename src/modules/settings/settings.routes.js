import express from 'express';
import { authenticate } from '../../core/middlewares/index.js';
import { getAIFeatureStatus } from '../admin/admin.settings.controller.js';

const router = express.Router();

/**
 * @swagger
 * /api/settings/ai-status:
 *   get:
 *     summary: Get AI feature status
 *     tags: [Settings]
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
 *                   properties:
 *                     proposalGeneration:
 *                       type: boolean
 *                     jobRecommendation:
 *                       type: boolean
 *       401:
 *         description: Not authenticated
 */
router.get('/ai-status', authenticate, getAIFeatureStatus);

export default router;
