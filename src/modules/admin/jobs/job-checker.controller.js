import * as jobCheckerService from './job-checker.service.js';
import createAppError from '../../../core/errors/AppError.js';
import { createAuditLog } from '../../../core/utils/auditLogger.js';

/**
 * Get all jobs with filters
 */
export const getAllJobs = async (req, res, next) => {
  try {
    const filters = req.query;
    const result = await jobCheckerService.getAllJobs(filters);
    
    res.status(200).json({
      success: true,
      message: 'Jobs retrieved successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get job by ID
 */
export const getJobById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const job = await jobCheckerService.getJobById(id);
    
    if (!job) {
      throw createAppError('Job not found', 404);
    }
    
    res.status(200).json({
      success: true,
      message: 'Job retrieved successfully',
      data: job,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Approve a job
 */
export const approveJob = async (req, res, next) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;
    
    const job = await jobCheckerService.approveJob(id, adminId);
    
    // Create audit log
    await createAuditLog({
      adminId,
      action: 'JOB_APPROVED',
      targetType: 'Job',
      targetId: job._id,
      targetName: job.title,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent'),
      metadata: {
        oldValue: 'pending',
        newValue: 'approved',
      },
      details: {
        jobId: job._id,
        clientId: job.client,
      },
    });
    
    res.status(200).json({
      success: true,
      message: 'Job approved successfully',
      data: job,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reject a job
 */
export const rejectJob = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user.id;
    
    const job = await jobCheckerService.rejectJob(id, reason, adminId);
    
    // Create audit log
    await createAuditLog({
      adminId,
      action: 'JOB_REJECTED',
      targetType: 'Job',
      targetId: job._id,
      targetName: job.title,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent'),
      metadata: {
        reason,
        oldValue: 'pending',
        newValue: 'rejected',
      },
      details: {
        jobId: job._id,
        clientId: job.client,
      },
    });
    
    res.status(200).json({
      success: true,
      message: 'Job rejected successfully',
      data: job,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Flag a job for review
 */
export const flagJob = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason, flagType } = req.body;
    const adminId = req.user.id;
    
    const job = await jobCheckerService.flagJob(id, { reason, flagType }, adminId);
    
    // Create audit log
    await createAuditLog({
      adminId,
      action: 'JOB_FLAGGED',
      targetType: 'Job',
      targetId: job._id,
      targetName: job.title,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent'),
      metadata: {
        reason,
        notes: `Flag Type: ${flagType}`,
      },
      details: {
        jobId: job._id,
        clientId: job.client,
        flagType,
      },
    });
    
    res.status(200).json({
      success: true,
      message: 'Job flagged successfully',
      data: job,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Toggle featured status
 */
export const toggleFeature = async (req, res, next) => {
  try {
    const { id } = req.params;
    const job = await jobCheckerService.toggleFeature(id);
    
    // Create audit log
    await createAuditLog({
      adminId: req.user.id,
      action: job.isFeatured ? 'JOB_FEATURED' : 'JOB_UNFEATURED',
      targetType: 'Job',
      targetId: job._id,
      targetName: job.title,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent'),
      metadata: {
        oldValue: !job.isFeatured,
        newValue: job.isFeatured,
      },
      details: {
        jobId: job._id,
        clientId: job.client,
      },
    });
    
    res.status(200).json({
      success: true,
      message: `Job ${job.isFeatured ? 'featured' : 'unfeatured'} successfully`,
      data: job,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a job
 */
export const deleteJob = async (req, res, next) => {
  try {
    const { id } = req.params;
    const job = await jobCheckerService.getJobById(id);
    
    await jobCheckerService.deleteJob(id);
    
    // Create audit log
    await createAuditLog({
      adminId: req.user.id,
      action: 'JOB_DELETED',
      targetType: 'Job',
      targetId: job._id,
      targetName: job.title,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent'),
      details: {
        jobId: job._id,
        clientId: job.client,
        deletedAt: new Date(),
      },
    });
    
    res.status(200).json({
      success: true,
      message: 'Job deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get job statistics
 */
export const getJobStats = async (req, res, next) => {
  try {
    const stats = await jobCheckerService.getJobStats();
    
    res.status(200).json({
      success: true,
      message: 'Job statistics retrieved successfully',
      data: stats,
    });
  } catch (error) {
    next(error);
  }
};
