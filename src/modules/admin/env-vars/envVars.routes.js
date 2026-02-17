import express from 'express';
import { authenticate, authorizeAdmin } from '../../../core/middlewares/index.js';
import {
  getEnvVars,
  getEnvVar,
  setEnvVar,
  deleteEnvVar,
  setBulkEnvVars,
  getPublicEnvVars,
} from './envVars.controller.js';

const router = express.Router();

/**
 * @swagger
 * /api/admin/env-vars/public:
 *   get:
 *     summary: Get public environment variables
 *     tags: [Admin - Env Vars]
 *     responses:
 *       200:
 *         description: Public environment variables
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 envVars:
 *                   type: object
 */
router.get('/public', getPublicEnvVars);

// All other routes require admin authentication
router.use(authenticate);
router.use(authorizeAdmin);

/**
 * @swagger
 * /api/admin/env-vars:
 *   get:
 *     summary: Get all environment variables
 *     tags: [Admin - Env Vars]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All environment variables
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.get('/', getEnvVars);

/**
 * @swagger
 * /api/admin/env-vars/{key}:
 *   get:
 *     summary: Get single environment variable
 *     tags: [Admin - Env Vars]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Environment variable value
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 *       404:
 *         description: Variable not found
 */
router.get('/:key', getEnvVar);

/**
 * @swagger
 * /api/admin/env-vars:
 *   post:
 *     summary: Create or update an environment variable
 *     tags: [Admin - Env Vars]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - key
 *               - value
 *             properties:
 *               key:
 *                 type: string
 *               value:
 *                 type: string
 *     responses:
 *       200:
 *         description: Variable created/updated
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.post('/', setEnvVar);

/**
 * @swagger
 * /api/admin/env-vars/{key}:
 *   put:
 *     summary: Update an environment variable
 *     tags: [Admin - Env Vars]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - value
 *             properties:
 *               value:
 *                 type: string
 *     responses:
 *       200:
 *         description: Variable updated
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.put('/:key', setEnvVar);

/**
 * @swagger
 * /api/admin/env-vars/{key}:
 *   delete:
 *     summary: Delete an environment variable
 *     tags: [Admin - Env Vars]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Variable deleted
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.delete('/:key', deleteEnvVar);

/**
 * @swagger
 * /api/admin/env-vars/bulk:
 *   post:
 *     summary: Bulk set environment variables
 *     tags: [Admin - Env Vars]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - variables
 *             properties:
 *               variables:
 *                 type: object
 *                 additionalProperties:
 *                   type: string
 *     responses:
 *       200:
 *         description: Variables set
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.post('/bulk', setBulkEnvVars);

export default router;

