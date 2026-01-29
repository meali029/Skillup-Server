import express from 'express';
import { authenticate, authorize } from '../../../core/middlewares/index.js';
import { getMyPermissions, getMyAdminProfile } from './permissions.controller.js';

const router = express.Router();

// All routes require admin authentication
router.use(authenticate, authorize('admin'));

/**
 * @swagger
 * /api/admin/permissions:
 *   get:
 *     summary: Get current admin user's permissions
 *     tags: [Admin - Permissions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Admin permissions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 permissions:
 *                   type: array
 *                   items:
 *                     type: string
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.get('/', getMyPermissions);

/**
 * @swagger
 * /api/admin/permissions/profile:
 *   get:
 *     summary: Get admin profile with permissions
 *     tags: [Admin - Permissions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Admin profile with permissions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 profile:
 *                   type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *                     adminRole:
 *                       type: string
 *                       enum: [moderator, admin, super_admin]
 *                     permissions:
 *                       type: array
 *                       items:
 *                         type: string
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.get('/profile', getMyAdminProfile);

export default router;
