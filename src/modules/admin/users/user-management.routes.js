import express from 'express';
import {
  getAllUsers,
  getUserById,
  suspendUser,
  banUser,
  activateUser,
  getUserActivity,
  exportUsers,
} from './user-management.controller.js';
import { authenticate, authorize } from '../../../core/middlewares/index.js';
import { requirePermission } from '../../../core/middlewares/permissions.js';
import { PERMISSIONS } from '../../../config/permissions.js';
import {
  validateUserQuery,
  validateUserAction,
} from './user-management.validation.js';

const router = express.Router();

// All admin routes require authentication and admin role
router.use(authenticate);
router.use(authorize('admin'));

// Get all users with filters - Moderator can view
router.get('/', requirePermission(PERMISSIONS.VIEW_USERS), validateUserQuery, getAllUsers);

// Export users - Admin and above
router.post('/export', requirePermission(PERMISSIONS.MANAGE_USERS), validateUserQuery, exportUsers);

// Get user by ID - Moderator can view
router.get('/:id', requirePermission(PERMISSIONS.VIEW_USERS), getUserById);

// Get user activity - Moderator can view
router.get('/:id/activity', requirePermission(PERMISSIONS.VIEW_USERS), getUserActivity);

// Update user status - Admin and above
router.put('/:id/suspend', requirePermission(PERMISSIONS.MANAGE_USERS), validateUserAction, suspendUser);
router.put('/:id/ban', requirePermission(PERMISSIONS.MANAGE_USERS), validateUserAction, banUser);
router.put('/:id/activate', requirePermission(PERMISSIONS.MANAGE_USERS), activateUser);

export default router;
