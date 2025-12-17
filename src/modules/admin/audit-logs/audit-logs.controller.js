import {
  getAuditLogs,
  getAuditLogById,
  getAuditLogStats,
  exportAuditLogs,
} from '../../../core/utils/auditLogger.js';
import createAppError from '../../../core/errors/AppError.js';
import { Parser } from 'json2csv';

/**
 * Get audit logs with filters
 * @route GET /api/admin/audit-logs
 * @access Admin only
 */
export const getAuditLogsController = async (req, res, next) => {
  try {
    const {
      adminId,
      action,
      targetType,
      targetId,
      startDate,
      endDate,
      page = 1,
      limit = 50,
    } = req.query;

    const filters = {
      adminId,
      action,
      targetType,
      targetId,
      startDate,
      endDate,
      page: parseInt(page),
      limit: parseInt(limit),
    };

    const result = await getAuditLogs(filters);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get single audit log by ID
 * @route GET /api/admin/audit-logs/:id
 * @access Admin only
 */
export const getAuditLogByIdController = async (req, res, next) => {
  try {
    const { id } = req.params;

    const log = await getAuditLogById(id);

    if (!log) {
      return next(createAppError('Audit log not found', 404));
    }

    res.status(200).json({
      success: true,
      data: log,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get audit log statistics
 * @route GET /api/admin/audit-logs/stats
 * @access Admin only
 */
export const getAuditLogStatsController = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const stats = await getAuditLogStats({ startDate, endDate });

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Export audit logs to CSV
 * @route GET /api/admin/audit-logs/export/csv
 * @access Admin only
 */
export const exportAuditLogsController = async (req, res, next) => {
  try {
    const {
      adminId,
      action,
      targetType,
      targetId,
      startDate,
      endDate,
    } = req.query;

    const filters = {
      adminId,
      action,
      targetType,
      targetId,
      startDate,
      endDate,
    };

    const logs = await exportAuditLogs(filters);

    const parser = new Parser();
    const csv = parser.parse(logs);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=audit-logs-${Date.now()}.csv`
    );

    res.status(200).send(csv);
  } catch (error) {
    next(error);
  }
};
