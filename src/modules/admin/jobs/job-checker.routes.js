import express from 'express';
import { authenticate, authorize } from '../../../core/middlewares/auth.middleware.js';
import { requirePermission } from '../../../core/middlewares/permissions.js';
import { PERMISSIONS } from '../../../config/permissions.js';
import * as jobCheckerController from './job-checker.controller.js';
import * as jobCheckerValidation from './job-checker.validation.js';

const router = express.Router();

// Apply authentication and admin authorization to all routes
router.use(authenticate);
router.use(authorize('admin'));

/**
 * @swagger
 * /api/admin/jobs:
 *   get:
 *     summary: Get all jobs with filters (for admin review)
 *     tags: [Admin - Jobs]
 *     security:
 *       - bearerAuth: []
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
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected, flagged]
 *       - in: query
 *         name: featured
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of jobs
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.get(
  '/',
  requirePermission(PERMISSIONS.VIEW_JOBS),
  jobCheckerValidation.getJobs,
  jobCheckerController.getAllJobs
);

/**
 * @swagger
 * /api/admin/jobs/stats/overview:
 *   get:
 *     summary: Get job statistics overview
 *     tags: [Admin - Jobs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Job statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 stats:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     pending:
 *                       type: integer
 *                     approved:
 *                       type: integer
 *                     flagged:
 *                       type: integer
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.get(
  '/stats/overview',
  requirePermission(PERMISSIONS.VIEW_JOBS),
  jobCheckerController.getJobStats
);

/**
 * @swagger
 * /api/admin/jobs/{id}:
 *   get:
 *     summary: Get job details
 *     tags: [Admin - Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Job details
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 *       404:
 *         description: Job not found
 */
router.get(
  '/:id',
  requirePermission(PERMISSIONS.VIEW_JOBS),
  jobCheckerValidation.getJobById,
  jobCheckerController.getJobById
);

/**
 * @swagger
 * /api/admin/jobs/{id}/approve:
 *   put:
 *     summary: Approve a job
 *     tags: [Admin - Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Job approved
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 *       404:
 *         description: Job not found
 */
router.put(
  '/:id/approve',
  requirePermission(PERMISSIONS.MANAGE_JOBS),
  jobCheckerValidation.jobAction,
  jobCheckerController.approveJob
);

/**
 * @swagger
 * /api/admin/jobs/{id}/reject:
 *   put:
 *     summary: Reject a job
 *     tags: [Admin - Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Job rejected
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 *       404:
 *         description: Job not found
 */
router.put(
  '/:id/reject',
  requirePermission(PERMISSIONS.MANAGE_JOBS),
  jobCheckerValidation.rejectJob,
  jobCheckerController.rejectJob
);

/**
 * @swagger
 * /api/admin/jobs/{id}/flag:
 *   put:
 *     summary: Flag a job for review
 *     tags: [Admin - Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Job flagged
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 *       404:
 *         description: Job not found
 */
router.put(
  '/:id/flag',
  requirePermission(PERMISSIONS.MANAGE_JOBS),
  jobCheckerValidation.flagJob,
  jobCheckerController.flagJob
);

/**
 * @swagger
 * /api/admin/jobs/{id}/feature:
 *   put:
 *     summary: Toggle job featured status
 *     tags: [Admin - Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Featured status toggled
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 *       404:
 *         description: Job not found
 */
router.put(
  '/:id/feature',
  requirePermission(PERMISSIONS.MANAGE_JOBS),
  jobCheckerValidation.jobAction,
  jobCheckerController.toggleFeature
);

/**
 * @swagger
 * /api/admin/jobs/{id}:
 *   delete:
 *     summary: Delete a job
 *     tags: [Admin - Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Job deleted
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 *       404:
 *         description: Job not found
 */
router.delete(
  '/:id',
  requirePermission(PERMISSIONS.DELETE_JOBS),
  jobCheckerValidation.jobAction,
  jobCheckerController.deleteJob
);

export default router;
