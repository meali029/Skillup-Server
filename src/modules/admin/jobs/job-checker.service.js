import Job from '../../../models/Job.js';
import User from '../../../models/User.js';
import createAppError from '../../../core/errors/AppError.js';
import { emitJobEvent } from '../../../sockets/index.js';

/**
 * Get all jobs with filters and pagination
 */
export const getAllJobs = async (filters) => {
  const {
    page = 1,
    limit = 20,
    status,
    category,
    isFlagged,
    isFeatured,
    search,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    startDate,
    endDate,
  } = filters;

  // Build query
  const query = {};

  if (status) query.status = status;
  if (category) query.category = category;
  if (isFlagged !== undefined) query.isFlagged = isFlagged === 'true';
  if (isFeatured !== undefined) query.isFeatured = isFeatured === 'true';
  
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
      { skills: { $in: [new RegExp(search, 'i')] } },
    ];
  }

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  // Calculate pagination
  const skip = (page - 1) * limit;

  // Sort options
  const sortOptions = {};
  sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

  // Execute query
  const [jobs, total] = await Promise.all([
    Job.find(query)
      .populate('client', 'name email avatar isVerified')
      .populate('assignedFreelancer', 'name email avatar')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Job.countDocuments(query),
  ]);

  return {
    jobs,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / limit),
    },
  };
};

/**
 * Get job by ID with full details
 */
export const getJobById = async (jobId) => {
  const job = await Job.findById(jobId)
    .populate('client', 'name email avatar isVerified company location')
    .populate('assignedFreelancer', 'name email avatar skills hourlyRate')
    .lean();

  if (!job) {
    throw createAppError('Job not found', 404);
  }

  // Get proposal count
  const Proposal = (await import('../../../models/Proposal.js')).default;
  const proposalCount = await Proposal.countDocuments({ job: jobId });

  return {
    ...job,
    proposalCount,
  };
};

/**
 * Approve a job
 */
export const approveJob = async (jobId, adminId) => {
  const job = await Job.findById(jobId);

  if (!job) {
    throw createAppError('Job not found', 404);
  }

  // Remove flag if exists
  job.isFlagged = false;
  job.flagReason = undefined;
  job.flagType = undefined;
  job.flaggedBy = undefined;
  job.flaggedAt = undefined;

  // Update moderation fields
  job.moderationStatus = 'approved';
  job.moderatedBy = adminId;
  job.moderatedAt = new Date();

  // Ensure job is active if it was rejected before
  if (job.status === 'closed' || job.status === 'cancelled') {
    job.status = 'open';
  }

  await job.save();

  return job;
};

/**
 * Reject a job
 */
export const rejectJob = async (jobId, reason, adminId) => {
  const job = await Job.findById(jobId);

  if (!job) {
    throw createAppError('Job not found', 404);
  }

  job.moderationStatus = 'rejected';
  job.rejectionReason = reason;
  job.moderatedBy = adminId;
  job.moderatedAt = new Date();
  job.status = 'closed';

  await job.save();

  // Emit socket event
  const admin = await User.findById(adminId).select('name role');
  emitJobEvent('job:rejected', {
    jobId: job._id,
    clientId: job.client.toString(),
    action: 'rejected',
    job,
    moderator: admin,
    reason,
  });
  
  return job;
};

/**
 * Flag a job for review
 */
export const flagJob = async (jobId, flagData, adminId) => {
  const { reason, flagType } = flagData;

  const job = await Job.findById(jobId);

  if (!job) {
    throw createAppError('Job not found', 404);
  }

  job.isFlagged = true;
  job.flagReason = reason;
  job.flagType = flagType;
  job.flaggedBy = adminId;
  job.flaggedAt = new Date();

  await job.save();

  // Emit socket event
  const admin = await User.findById(adminId).select('name role');
  emitJobEvent('job:flagged', {
    jobId: job._id,
    clientId: job.client.toString(),
    action: 'flagged',
    job,
    moderator: admin,
    reason,
  });

  return job;
};

/**
 * Toggle featured status
 */
export const toggleFeature = async (jobId, adminId) => {
  const job = await Job.findById(jobId);

  if (!job) {
    throw createAppError('Job not found', 404);
  }

  const wasFeatured = job.isFeatured;
  job.isFeatured = !job.isFeatured;
  await job.save();

  // Emit socket event
  const admin = await User.findById(adminId).select('name role');
  emitJobEvent(job.isFeatured ? 'job:featured' : 'job:unfeatured', {
    jobId: job._id,
    clientId: job.client.toString(),
    action: job.isFeatured ? 'featured' : 'unfeatured',
    job,
    moderator: admin,
  });

  return job;
};

/**
 * Delete a job
 */
export const deleteJob = async (jobId) => {
  const job = await Job.findById(jobId);

  if (!job) {
    throw createAppError('Job not found', 404);
  }

  // Check if job has active proposals
  const Proposal = (await import('../../../models/Proposal.js')).default;
  const activeProposals = await Proposal.countDocuments({ 
    job: jobId, 
    status: { $in: ['pending', 'accepted'] } 
  });

  if (activeProposals > 0) {
    throw createAppError('Cannot delete job with active proposals', 400);
  }

  await Job.findByIdAndDelete(jobId);

  // Delete all proposals for this job
  await Proposal.deleteMany({ job: jobId });

  return true;
};

/**
 * Get job statistics
 */
export const getJobStats = async () => {
  const [
    totalJobs,
    openJobs,
    inProgressJobs,
    completedJobs,
    flaggedJobs,
    featuredJobs,
    statusBreakdown,
    categoryBreakdown,
  ] = await Promise.all([
    Job.countDocuments(),
    Job.countDocuments({ status: 'open' }),
    Job.countDocuments({ status: 'in-progress' }),
    Job.countDocuments({ status: 'completed' }),
    Job.countDocuments({ isFlagged: true }),
    Job.countDocuments({ isFeatured: true }),
    Job.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]),
    Job.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
  ]);

  // Get jobs created in last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const recentJobs = await Job.countDocuments({
    createdAt: { $gte: thirtyDaysAgo },
  });

  return {
    total: totalJobs,
    open: openJobs,
    inProgress: inProgressJobs,
    completed: completedJobs,
    flagged: flaggedJobs,
    featured: featuredJobs,
    recentJobs,
    statusBreakdown,
    categoryBreakdown,
  };
};
