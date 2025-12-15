import AuditLog from '../../models/AuditLog.js';

/**
 * Create an audit log entry
 * @param {Object} logData - The audit log data
 * @param {string} logData.adminId - ID of the admin performing the action
 * @param {string} logData.action - Action type (ADMIN_LOGIN, USER_SUSPENDED, etc.)
 * @param {string} [logData.targetType] - Type of target (User, Job, System, etc.)
 * @param {string} [logData.targetId] - ID of the target entity
 * @param {string} [logData.targetName] - Name/title of target for display
 * @param {Object} [logData.details] - Additional action-specific details
 * @param {string} [logData.ipAddress] - IP address of the request
 * @param {string} [logData.userAgent] - User agent string
 * @param {Object} [logData.metadata] - Metadata (oldValue, newValue, reason, notes)
 * @returns {Promise<AuditLog>} Created audit log
 */
export const createAuditLog = async (logData) => {
  try {
    const auditLog = await AuditLog.create(logData);
    return auditLog;
  } catch (error) {
    console.error('Error creating audit log:', error);
    // Don't throw error - audit logging failure shouldn't break the main operation
    return null;
  }
};

/**
 * Get audit logs with filters and pagination
 * @param {Object} filters - Filter options
 * @param {string} [filters.adminId] - Filter by admin ID
 * @param {string} [filters.action] - Filter by action type
 * @param {string} [filters.targetType] - Filter by target type
 * @param {string} [filters.targetId] - Filter by target ID
 * @param {Date} [filters.startDate] - Filter logs after this date
 * @param {Date} [filters.endDate] - Filter logs before this date
 * @param {number} [filters.page=1] - Page number
 * @param {number} [filters.limit=50] - Items per page
 * @returns {Promise<{logs: Array, total: number, page: number, totalPages: number}>}
 */
export const getAuditLogs = async (filters = {}) => {
  const {
    adminId,
    action,
    targetType,
    targetId,
    startDate,
    endDate,
    page = 1,
    limit = 50,
  } = filters;

  const query = {};

  if (adminId) query.adminId = adminId;
  if (action) query.action = action;
  if (targetType) query.targetType = targetType;
  if (targetId) query.targetId = targetId;

  // Date range filter
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  const skip = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    AuditLog.find(query)
      .populate('adminId', 'name email role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AuditLog.countDocuments(query),
  ]);

  return {
    logs,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    hasMore: page * limit < total,
  };
};

/**
 * Get audit log by ID
 * @param {string} logId - Audit log ID
 * @returns {Promise<AuditLog>}
 */
export const getAuditLogById = async (logId) => {
  const log = await AuditLog.findById(logId)
    .populate('adminId', 'name email role avatar')
    .lean();
  return log;
};

/**
 * Get audit log statistics
 * @param {Object} filters - Filter options
 * @returns {Promise<Object>} Statistics object
 */
export const getAuditLogStats = async (filters = {}) => {
  const { startDate, endDate } = filters;

  const matchStage = {};
  if (startDate || endDate) {
    matchStage.createdAt = {};
    if (startDate) matchStage.createdAt.$gte = new Date(startDate);
    if (endDate) matchStage.createdAt.$lte = new Date(endDate);
  }

  const stats = await AuditLog.aggregate([
    ...(Object.keys(matchStage).length > 0 ? [{ $match: matchStage }] : []),
    {
      $facet: {
        totalLogs: [{ $count: 'count' }],
        byAction: [
          { $group: { _id: '$action', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ],
        byAdmin: [
          { $group: { _id: '$adminId', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
          {
            $lookup: {
              from: 'users',
              localField: '_id',
              foreignField: '_id',
              as: 'admin',
            },
          },
          { $unwind: '$admin' },
          {
            $project: {
              adminId: '$_id',
              name: '$admin.name',
              email: '$admin.email',
              count: 1,
            },
          },
        ],
        recentActivity: [
          { $sort: { createdAt: -1 } },
          { $limit: 10 },
          {
            $lookup: {
              from: 'users',
              localField: 'adminId',
              foreignField: '_id',
              as: 'admin',
            },
          },
          { $unwind: '$admin' },
          {
            $project: {
              action: 1,
              targetType: 1,
              targetName: 1,
              createdAt: 1,
              admin: { name: '$admin.name', email: '$admin.email' },
            },
          },
        ],
      },
    },
  ]);

  return {
    totalLogs: stats[0].totalLogs[0]?.count || 0,
    byAction: stats[0].byAction,
    topAdmins: stats[0].byAdmin,
    recentActivity: stats[0].recentActivity,
  };
};

/**
 * Export audit logs to CSV format
 * @param {Object} filters - Filter options
 * @returns {Promise<Array>} Array of log objects for CSV export
 */
export const exportAuditLogs = async (filters = {}) => {
  const { logs } = await getAuditLogs({ ...filters, limit: 10000 }); // Export up to 10k logs

  return logs.map((log) => ({
    Date: new Date(log.createdAt).toLocaleString(),
    Admin: log.adminId?.name || 'Unknown',
    Email: log.adminId?.email || '',
    Action: log.action,
    TargetType: log.targetType || '',
    TargetName: log.targetName || '',
    Reason: log.metadata?.reason || '',
    IPAddress: log.ipAddress || '',
  }));
};
