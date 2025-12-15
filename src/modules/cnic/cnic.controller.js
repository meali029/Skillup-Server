import asyncHandler from '../../core/utils/asyncHandler.js';
import { successResponse } from '../../core/utils/responseFormatter.js';
import * as cnicService from './cnic.service.js';
import { createAuditLog } from '../../core/utils/auditLogger.js';

/**
 * @desc    Submit CNIC for verification
 * @route   POST /api/cnic/submit
 * @access  Private (User)
 */
export const submitCNIC = asyncHandler(async (req, res) => {
  const result = await cnicService.submitCNIC(req.user.id, req.files);
  successResponse(res, result, result.message, 201);
});

/**
 * @desc    Get my CNIC status
 * @route   GET /api/cnic/status
 * @access  Private (User)
 */
export const getMyCNICStatus = asyncHandler(async (req, res) => {
  const result = await cnicService.getMyCNICStatus(req.user.id);
  successResponse(res, result, 'CNIC status retrieved successfully', 200);
});

/**
 * @desc    Get pending CNICs
 * @route   GET /api/cnic/admin/pending
 * @access  Admin
 */
export const getPendingCNICs = asyncHandler(async (req, res) => {
  const filters = {
    page: parseInt(req.query.page) || 1,
    limit: parseInt(req.query.limit) || 20,
    status: req.query.status || 'pending',
    search: req.query.search,
  };

  const result = await cnicService.getPendingCNICs(filters);
  successResponse(res, result, 'Pending CNICs retrieved successfully', 200);
});

/**
 * @desc    Get CNIC details by user ID
 * @route   GET /api/cnic/admin/:userId
 * @access  Admin
 */
export const getCNICDetails = asyncHandler(async (req, res) => {
  const user = await cnicService.getCNICDetails(req.params.userId);
  successResponse(res, user, 'CNIC details retrieved successfully', 200);
});

/**
 * @desc    Approve CNIC
 * @route   PUT /api/cnic/admin/:userId/approve
 * @access  Admin
 */
export const approveCNIC = asyncHandler(async (req, res) => {
  const result = await cnicService.approveCNIC(
    req.params.userId,
    req.user.id,
    req.body
  );

  // Create audit log
  await createAuditLog({
    adminId: req.user.id,
    action: 'CNIC_APPROVED',
    targetType: 'User',
    targetId: req.params.userId,
    targetName: result.user.name,
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent'),
    metadata: {
      oldValue: 'pending',
      newValue: 'verified',
    },
    details: {
      userId: req.params.userId,
      userEmail: result.user.email,
      cnicNumber: req.body.number,
    },
  });

  successResponse(res, result, result.message, 200);
});

/**
 * @desc    Reject CNIC
 * @route   PUT /api/cnic/admin/:userId/reject
 * @access  Admin
 */
export const rejectCNIC = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const result = await cnicService.rejectCNIC(req.params.userId, req.user.id, reason);

  // Create audit log
  await createAuditLog({
    adminId: req.user.id,
    action: 'CNIC_REJECTED',
    targetType: 'User',
    targetId: req.params.userId,
    targetName: result.user.name,
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent'),
    metadata: {
      reason,
      oldValue: 'pending',
      newValue: 'rejected',
    },
    details: {
      userId: req.params.userId,
      userEmail: result.user.email,
    },
  });

  successResponse(res, result, result.message, 200);
});

/**
 * @desc    Request re-upload
 * @route   PUT /api/cnic/admin/:userId/reupload
 * @access  Admin
 */
export const requestReupload = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const result = await cnicService.requestReupload(req.params.userId, req.user.id, reason);

  successResponse(res, result, result.message, 200);
});

/**
 * @desc    Get CNIC statistics
 * @route   GET /api/cnic/admin/stats
 * @access  Admin
 */
export const getCNICStats = asyncHandler(async (req, res) => {
  const stats = await cnicService.getCNICStats();
  successResponse(res, stats, 'CNIC statistics retrieved successfully', 200);
});
