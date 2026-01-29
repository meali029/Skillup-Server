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

/**
 * @swagger
 * /api/admin/audit-logs/stats:
 *   get:
 *     summary: Get audit log statistics
 *     tags: [Admin - Audit Logs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Audit log statistics
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
 *                     byAction:
 *                       type: object
 *                     byUser:
 *                       type: object
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.get('/stats', requirePermission(PERMISSIONS.VIEW_AUDIT_LOGS), getAuditLogStatsController);

/**
 * @swagger
 * /api/admin/audit-logs/export/csv:
 *   get:
 *     summary: Export audit logs to CSV
 *     tags: [Admin - Audit Logs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: CSV file download
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.get('/export/csv', requirePermission(PERMISSIONS.MANAGE_AUDIT_LOGS), exportAuditLogsController);

/**
 * @swagger
 * /api/admin/audit-logs:
 *   get:
 *     summary: Get all audit logs with filters
 *     tags: [Admin - Audit Logs]
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
 *         name: action
 *         schema:
 *           type: string
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: List of audit logs
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.get('/', requirePermission(PERMISSIONS.VIEW_AUDIT_LOGS), getAuditLogsController);

/**
 * @swagger
 * /api/admin/audit-logs/{id}:
 *   get:
 *     summary: Get audit log by ID
 *     tags: [Admin - Audit Logs]
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
 *         description: Audit log details
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 *       404:
 *         description: Audit log not found
 */
router.get('/:id', requirePermission(PERMISSIONS.VIEW_AUDIT_LOGS), getAuditLogByIdController);

export default router;
