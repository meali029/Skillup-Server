import express from 'express';
import { authenticate, authorize } from '../../../core/middlewares/index.js';
import { requirePermission } from '../../../core/middlewares/permissions.js';
import { PERMISSIONS } from '../../../config/permissions.js';
import * as analyticsController from './analytics.controller.js';

const router = express.Router();

// All routes require admin authentication
router.use(authenticate);
router.use(authorize('admin'));

/**
 * @swagger
 * /api/admin/analytics/dashboard:
 *   get:
 *     summary: Get dashboard metrics
 *     tags: [Admin - Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard metrics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 metrics:
 *                   type: object
 *                   properties:
 *                     totalUsers:
 *                       type: integer
 *                     totalJobs:
 *                       type: integer
 *                     totalContracts:
 *                       type: integer
 *                     totalRevenue:
 *                       type: number
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.get('/dashboard', requirePermission(PERMISSIONS.VIEW_ANALYTICS), analyticsController.getDashboardMetrics);

/**
 * @swagger
 * /api/admin/analytics/user-growth:
 *   get:
 *     summary: Get user growth report
 *     tags: [Admin - Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [week, month, year]
 *     responses:
 *       200:
 *         description: User growth data
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.get('/user-growth', requirePermission(PERMISSIONS.VIEW_ANALYTICS), analyticsController.getUserGrowthReport);

/**
 * @swagger
 * /api/admin/analytics/revenue:
 *   get:
 *     summary: Get revenue report
 *     tags: [Admin - Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [week, month, year]
 *     responses:
 *       200:
 *         description: Revenue data
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.get('/revenue', requirePermission(PERMISSIONS.VIEW_ADVANCED_ANALYTICS), analyticsController.getRevenueReport);

/**
 * @swagger
 * /api/admin/analytics/categories:
 *   get:
 *     summary: Get category distribution
 *     tags: [Admin - Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Category distribution data
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.get('/categories', requirePermission(PERMISSIONS.VIEW_ANALYTICS), analyticsController.getCategoryDistribution);

/**
 * @swagger
 * /api/admin/analytics/flagged-jobs:
 *   get:
 *     summary: Get flagged jobs report
 *     tags: [Admin - Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Flagged jobs data
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.get('/flagged-jobs', requirePermission(PERMISSIONS.VIEW_ANALYTICS), analyticsController.getFlaggedJobsReport);

/**
 * @swagger
 * /api/admin/analytics/export/pdf:
 *   get:
 *     summary: Export analytics to PDF
 *     tags: [Admin - Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: PDF file download
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.get('/export/pdf', requirePermission(PERMISSIONS.EXPORT_ANALYTICS), analyticsController.exportToPDF);

/**
 * @swagger
 * /api/admin/analytics/export/excel:
 *   get:
 *     summary: Export analytics to Excel
 *     tags: [Admin - Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Excel file download
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.get('/export/excel', requirePermission(PERMISSIONS.EXPORT_ANALYTICS), analyticsController.exportToExcel);

/**
 * @swagger
 * /api/admin/analytics/export/csv:
 *   get:
 *     summary: Export analytics to CSV
 *     tags: [Admin - Analytics]
 *     security:
 *       - bearerAuth: []
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
router.get('/export/csv', requirePermission(PERMISSIONS.EXPORT_ANALYTICS), analyticsController.exportToCSV);

export default router;
