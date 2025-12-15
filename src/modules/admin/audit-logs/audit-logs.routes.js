import express from 'express';
import {
  getAuditLogsController,
  getAuditLogByIdController,
  getAuditLogStatsController,
  exportAuditLogsController,
} from './audit-logs.controller.js';
import { authenticate, authorize } from '../../../core/middlewares/index.js';
import { requirePermission } from '../../../core/middlewares/permissions.js';
import { PERMISSIONS } from '../../../config/permissions.js';

const router = express.Router();

// All routes require admin authentication
router.use(authenticate, authorize('admin'));

// Get audit log statistics - All admins can view
router.get('/stats', requirePermission(PERMISSIONS.VIEW_AUDIT_LOGS), getAuditLogStatsController);

// Export audit logs to CSV - Admin and above
router.get('/export/csv', requirePermission(PERMISSIONS.MANAGE_AUDIT_LOGS), exportAuditLogsController);

// Get all audit logs with filters - All admins can view
router.get('/', requirePermission(PERMISSIONS.VIEW_AUDIT_LOGS), getAuditLogsController);

// Get single audit log by ID - All admins can view
router.get('/:id', requirePermission(PERMISSIONS.VIEW_AUDIT_LOGS), getAuditLogByIdController);

export default router;
