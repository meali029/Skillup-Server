import express from 'express';
import { authenticate, authorize } from '../../../core/middlewares/index.js';
import { getMyPermissions, getMyAdminProfile } from './permissions.controller.js';

const router = express.Router();

// All routes require admin authentication
router.use(authenticate, authorize('admin'));

/**
 * @route   GET /api/admin/permissions
 * @desc    Get current admin user's permissions
 * @access  Admin
 */
router.get('/', getMyPermissions);

/**
 * @route   GET /api/admin/permissions/profile
 * @desc    Get admin profile with permissions
 * @access  Admin
 */
router.get('/profile', getMyAdminProfile);

export default router;
