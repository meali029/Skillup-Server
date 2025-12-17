import asyncHandler from '../../../core/utils/asyncHandler.js';
import * as userManagementService from './user-management.service.js';
import { successResponse } from '../../../core/utils/responseFormatter.js';
import AppError from '../../../core/errors/AppError.js';
import { createAuditLog } from '../../../core/utils/auditLogger.js';

/**
 * @desc    Get all users with filters
 * @route   GET /api/admin/users
 * @access  Admin
 */
export const getAllUsers = asyncHandler(async (req, res) => {
  const filters = {
    page: parseInt(req.query.page) || 1,
    limit: parseInt(req.query.limit) || 10,
    role: req.query.role,
    status: req.query.status,
    isVerified: req.query.isVerified,
    search: req.query.search,
    sortBy: req.query.sortBy || 'createdAt',
    sortOrder: req.query.sortOrder || 'desc',
    startDate: req.query.startDate,
    endDate: req.query.endDate,
  };

  const result = await userManagementService.getAllUsers(filters);

  successResponse(res, result, 'Users fetched successfully', 200);
});

/**
 * @desc    Get user by ID
 * @route   GET /api/admin/users/:id
 * @access  Admin
 */
export const getUserById = asyncHandler(async (req, res) => {
  const user = await userManagementService.getUserById(req.params.id);

  if (!user) {
    throw AppError('User not found', 404);
  }

  successResponse(res, user, 'User fetched successfully', 200);
});

/**
 * @desc    Suspend user
 * @route   PUT /api/admin/users/:id/suspend
 * @access  Admin
 */
export const suspendUser = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  console.log('=== SUSPEND USER CONTROLLER ===');
  console.log('User ID:', req.params.id);
  console.log('Reason:', reason);
  console.log('Admin:', req.user);

  const user = await userManagementService.suspendUser(
    req.params.id,
    reason,
    req.user.id
  );
  console.log('Suspended user:', user._id, 'isActive:', user.isActive);

  // Create audit log
  await createAuditLog({
    adminId: req.user.id,
    action: 'USER_SUSPENDED',
    targetType: 'User',
    targetId: user._id,
    targetName: user.name,
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent'),
    metadata: {
      reason,
      oldValue: 'active',
      newValue: 'suspended',
    },
    details: {
      userEmail: user.email,
      userRole: user.role,
    },
  });

  successResponse(res, user, 'User suspended successfully', 200);
});

/**
 * @desc    Ban user permanently
 * @route   PUT /api/admin/users/:id/ban
 * @access  Admin
 */
export const banUser = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  console.log('=== BAN USER CONTROLLER ===');
  console.log('User ID:', req.params.id);
  console.log('Reason:', reason);
  console.log('Admin:', req.user);

  const user = await userManagementService.banUser(
    req.params.id,
    reason,
    req.user.id
  );
  console.log('Banned user:', user._id, 'isBanned:', user.isBanned, 'isActive:', user.isActive);

  // Create audit log
  await createAuditLog({
    adminId: req.user.id,
    action: 'USER_BANNED',
    targetType: 'User',
    targetId: user._id,
    targetName: user.name,
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent'),
    metadata: {
      reason,
      oldValue: user.status === 'suspended' ? 'suspended' : 'active',
      newValue: 'banned',
    },
    details: {
      userEmail: user.email,
      userRole: user.role,
    },
  });

  successResponse(res, user, 'User banned successfully', 200);
});

/**
 * @desc    Activate user
 * @route   PUT /api/admin/users/:id/activate
 * @access  Admin
 */
export const activateUser = asyncHandler(async (req, res) => {
  const oldStatus = await userManagementService.getUserById(req.params.id).then(u => u.status);
  
  const user = await userManagementService.activateUser(
    req.params.id,
    req.user.id
  );

  // Create audit log
  await createAuditLog({
    adminId: req.user.id,
    action: oldStatus === 'suspended' ? 'USER_UNSUSPENDED' : 'USER_UNBANNED',
    targetType: 'User',
    targetId: user._id,
    targetName: user.name,
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent'),
    metadata: {
      oldValue: oldStatus,
      newValue: 'active',
    },
    details: {
      userEmail: user.email,
      userRole: user.role,
    },
  });

  successResponse(res, user, 'User activated successfully', 200);
});

/**
 * @desc    Get user activity
 * @route   GET /api/admin/users/:id/activity
 * @access  Admin
 */
export const getUserActivity = asyncHandler(async (req, res) => {
  const activity = await userManagementService.getUserActivity(req.params.id);

  successResponse(res, activity, 'User activity fetched successfully', 200);
});

/**
 * @desc    Export users
 * @route   POST /api/admin/users/export
 * @access  Admin
 */
export const exportUsers = asyncHandler(async (req, res) => {
  const filters = {
    role: req.query.role,
    status: req.query.status,
    isVerified: req.query.isVerified,
    search: req.query.search,
    startDate: req.query.startDate,
    endDate: req.query.endDate,
  };

  const format = req.query.format || 'excel'; // excel or csv

  const buffer = await userManagementService.exportUsers(filters, format);

  const filename = `users-export-${Date.now()}.${format === 'excel' ? 'xlsx' : 'csv'}`;

  res.setHeader(
    'Content-Type',
    format === 'excel'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/csv'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  res.send(buffer);
});
