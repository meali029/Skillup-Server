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
 * @route   GET /api/admin/jobs
 * @desc    Get all jobs with filters (for admin review)
 * @access  Admin (Moderator can view)
 */
router.get(
  '/',
  requirePermission(PERMISSIONS.VIEW_JOBS),
  jobCheckerValidation.getJobs,
  jobCheckerController.getAllJobs
);

/**
 * @route   GET /api/admin/jobs/stats/overview
 * @desc    Get job statistics overview
 * @access  Admin (Moderator can view)
 */
router.get(
  '/stats/overview',
  requirePermission(PERMISSIONS.VIEW_JOBS),
  jobCheckerController.getJobStats
);

/**
 * @route   GET /api/admin/jobs/:id
 * @desc    Get job details
 * @access  Admin (Moderator can view)
 */
router.get(
  '/:id',
  requirePermission(PERMISSIONS.VIEW_JOBS),
  jobCheckerValidation.getJobById,
  jobCheckerController.getJobById
);

/**
 * @route   PUT /api/admin/jobs/:id/approve
 * @desc    Approve a job
 * @access  Admin (Admin and above)
 */
router.put(
  '/:id/approve',
  requirePermission(PERMISSIONS.MANAGE_JOBS),
  jobCheckerValidation.jobAction,
  jobCheckerController.approveJob
);

/**
 * @route   PUT /api/admin/jobs/:id/reject
 * @desc    Reject a job
 * @access  Admin (Admin and above)
 */
router.put(
  '/:id/reject',
  requirePermission(PERMISSIONS.MANAGE_JOBS),
  jobCheckerValidation.rejectJob,
  jobCheckerController.rejectJob
);

/**
 * @route   PUT /api/admin/jobs/:id/flag
 * @desc    Flag a job for review
 * @access  Admin (Moderator can flag)
 */
router.put(
  '/:id/flag',
  requirePermission(PERMISSIONS.MANAGE_JOBS),
  jobCheckerValidation.flagJob,
  jobCheckerController.flagJob
);

/**
 * @route   PUT /api/admin/jobs/:id/feature
 * @desc    Toggle featured status
 * @access  Admin (Admin and above)
 */
router.put(
  '/:id/feature',
  requirePermission(PERMISSIONS.MANAGE_JOBS),
  jobCheckerValidation.jobAction,
  jobCheckerController.toggleFeature
);

/**
 * @route   DELETE /api/admin/jobs/:id
 * @desc    Delete a job
 * @access  Admin (Admin and above)
 */
router.delete(
  '/:id',
  requirePermission(PERMISSIONS.DELETE_JOBS),
  jobCheckerValidation.jobAction,
  jobCheckerController.deleteJob
);

export default router;
