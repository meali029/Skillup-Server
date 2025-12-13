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
import {
  validateUserQuery,
  validateUserAction,
} from './user-management.validation.js';

const router = express.Router();

// All admin routes require authentication and admin role
router.use(authenticate);
router.use(authorize('admin'));

// Get all users with filters
router.get('/', validateUserQuery, getAllUsers);

// Export users
router.post('/export', validateUserQuery, exportUsers);

// Get user by ID
router.get('/:id', getUserById);

// Get user activity
router.get('/:id/activity', getUserActivity);

// Update user status
router.put('/:id/suspend', validateUserAction, suspendUser);
router.put('/:id/ban', validateUserAction, banUser);
router.put('/:id/activate', activateUser);

export default router;
