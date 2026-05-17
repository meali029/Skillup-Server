import express from 'express';
import {
  getFreelancerById,
  getUserById,
  getFreelancers,
  getNotificationSettings,
  getPreferences,
  updateNotificationSettings,
  updatePassword,
  updatePreferences,
} from './user.controller.js';
import { authenticate } from '../../core/middlewares/index.js';
import { validateChangePassword } from '../auth/auth.validation.js';

const router = express.Router();

router.put('/profile/password', authenticate, validateChangePassword, updatePassword);
router.get('/settings/notifications', authenticate, getNotificationSettings);
router.put('/settings/notifications', authenticate, updateNotificationSettings);
router.get('/preferences', authenticate, getPreferences);
router.put('/preferences', authenticate, updatePreferences);

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: Get user by ID
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       404:
 *         description: User not found
 */
/**
 * @swagger
 * /api/users/freelancers:
 *   get:
 *     summary: Get all freelancers
 *     tags: [Users]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: skills
 *         schema:
 *           type: string
 *         description: Comma-separated skills
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of freelancers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 freelancers:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 */
router.get('/freelancers', getFreelancers);

/**
 * @swagger
 * /api/users/freelancers/{id}:
 *   get:
 *     summary: Get freelancer by ID
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Freelancer details
 *       404:
 *         description: Freelancer not found
 */
router.get('/freelancers/:id', getFreelancerById);

router.get('/:id', getUserById);

export default router;
