import Job from '../../models/Job.js';
import User from '../../models/User.js';
import { AppError } from '../../core/errors/index.js';

export const createJob = async (jobData, clientId) => {
  const job = new Job({
    ...jobData,
    client: clientId,
  });
  
  await job.save();
  await job.populate('client', 'name email companyName');
  
  await User.findByIdAndUpdate(clientId, {
    $inc: { 
      postedJobsCount: 1,
      activeJobsCount: job.status === 'open' ? 1 : 0
    }
  });
  
  return job;
};

export const getAllJobs = async (filters = {}, options = {}) => {
  const {
    page = 1,
    limit = 10,
    sort = '-createdAt',
    category,
    budgetType,
    minBudget,
    maxBudget,
    experienceLevel,
    locationType,
    skills,
    search,
    status = 'open',
  } = { ...filters, ...options };

  const query = {
    status,
    isActive: true,
    deletedAt: null,
  };

  if (category) query.category = category;
  if (budgetType) query.budgetType = budgetType;

  if (minBudget !== undefined || maxBudget !== undefined) {
    query.budgetAmount = {};
    if (minBudget !== undefined) query.budgetAmount.$gte = minBudget;
    if (maxBudget !== undefined) query.budgetAmount.$lte = maxBudget;
  }

  if (experienceLevel) query.experienceLevel = experienceLevel;
  if (locationType) query.locationType = locationType;

  if (skills) {
    const skillArray = Array.isArray(skills) ? skills : [skills];
    query.skills = { $in: skillArray.map(s => s.toLowerCase()) };
  }

  if (search) query.$text = { $search: search };

  const skip = (page - 1) * limit;

  const [jobs, total] = await Promise.all([
    Job.find(query)
      .populate({
        path: 'client',
        select: 'name email companyName isActive isBanned',
      })
      .sort(search ? { score: { $meta: 'textScore' } } : sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Job.countDocuments(query),
  ]);

  // Filter out jobs from banned or suspended users
  const filteredJobs = jobs.filter(job => {
    return job.client && job.client.isActive && !job.client.isBanned;
  });

  return {
    jobs: filteredJobs,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: filteredJobs.length,
      pages: Math.ceil(filteredJobs.length / limit),
    },
  };
};

export const getJobById = async (jobId) => {
  const job = await Job.findOne({
    _id: jobId,
    isActive: true,
    deletedAt: null,
  }).populate('client', 'name email companyName isActive isBanned');

  if (!job) {
    throw AppError('Job not found', 404);
  }

  // Check if client is banned or suspended
  if (!job.client || !job.client.isActive || job.client.isBanned) {
    throw AppError('This job is no longer available', 404);
  }

  await job.incrementViews();

  return job;
};

export const updateJob = async (jobId, userId, updateData) => {
  const job = await Job.findOne({
    _id: jobId,
    client: userId,
    isActive: true,
    deletedAt: null,
  });

  if (!job) {
    throw AppError('Job not found or unauthorized', 404);
  }

  if (job.proposalsCount > 0) {
    const restrictedFields = ['budgetAmount', 'budgetType', 'category'];
    const hasRestrictedUpdate = restrictedFields.some(field => updateData[field]);
    
    if (hasRestrictedUpdate) {
      throw AppError('Cannot update budget or category after receiving proposals', 400);
    }
  }

  Object.assign(job, updateData);
  await job.save();
  await job.populate('client', 'name email companyName');

  return job;
};

export const deleteJob = async (jobId, userId) => {
  const job = await Job.findOne({
    _id: jobId,
    client: userId,
    isActive: true,
    deletedAt: null,
  });

  if (!job) {
    throw AppError('Job not found or unauthorized', 404);
  }

  const wasOpen = job.status === 'open';
  
  if (job.status === 'draft') {
    await Job.findByIdAndDelete(jobId);
  } else if (job.proposalsCount === 0) {
    job.deletedAt = new Date();
    job.isActive = false;
    await job.save();
  } else {
    throw AppError('Cannot delete job with active proposals. Close the job instead.', 400);
  }
  
  const updates = { $inc: { postedJobsCount: -1 } };
  if (wasOpen) {
    updates.$inc.activeJobsCount = -1;
  }
  await User.findByIdAndUpdate(userId, updates);

  return { message: 'Job deleted successfully' };
};

export const getClientJobs = async (clientId, options = {}) => {
  const { page = 1, limit = 10, status } = options;
  
  const query = {
    client: clientId,
    isActive: true,
    deletedAt: null,
  };

  if (status) query.status = status;

  const skip = (page - 1) * limit;

  const [jobs, total] = await Promise.all([
    Job.find(query)
      .sort('-createdAt')
      .skip(skip)
      .limit(limit)
      .lean(),
    Job.countDocuments(query),
  ]);

  return {
    jobs,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

export const closeJob = async (jobId, userId) => {
  const job = await Job.findOne({
    _id: jobId,
    client: userId,
    isActive: true,
    deletedAt: null,
  });

  if (!job) {
    throw AppError('Job not found or unauthorized', 404);
  }

  const previousStatus = job.status;
  job.status = 'closed';
  await job.save();
  
  if (previousStatus === 'open') {
    await User.findByIdAndUpdate(userId, {
      $inc: { activeJobsCount: -1 }
    });
  }

  return job;
};

export const getJobStats = async (clientId) => {
  const stats = await Job.aggregate([
    {
      $match: {
        client: clientId,
        isActive: true,
        deletedAt: null,
      },
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalBudget: { $sum: '$budgetAmount' },
      },
    },
  ]);

  const totalJobs = await Job.countDocuments({
    client: clientId,
    isActive: true,
    deletedAt: null,
  });

  return {
    total: totalJobs,
    byStatus: stats,
  };
};

export const completeJob = async (jobId, userId, freelancerId, finalAmount) => {
  const job = await Job.findOne({
    _id: jobId,
    client: userId,
    isActive: true,
    deletedAt: null,
  });

  if (!job) {
    throw AppError('Job not found or unauthorized', 404);
  }

  if (job.status !== 'in-progress' && job.status !== 'in-review') {
    throw AppError('Only jobs in progress or in review can be completed', 400);
  }

  const wasOpen = job.status === 'open';
  job.status = 'completed';
  job.assignedFreelancer = freelancerId;
  await job.save();

  const clientUpdates = { 
    $inc: { totalSpent: finalAmount || job.budgetAmount }
  };
  if (wasOpen) {
    clientUpdates.$inc.activeJobsCount = -1;
  }
  await User.findByIdAndUpdate(userId, clientUpdates);

  await User.findByIdAndUpdate(freelancerId, {
    $inc: { 
      completedJobsCount: 1,
      totalEarnings: finalAmount || job.budgetAmount,
      activeProposalsCount: -1
    }
  });

  return job;
};

export const getRecommendedJobs = async (userId) => {
  const user = await User.findById(userId);
  
  if (!user) {
    throw AppError('User not found', 404);
  }

  if (user.role !== 'freelancer') {
    throw AppError('User is not a freelancer', 403);
  }

  const userSkills = user.skills || [];

  const query = {
    status: 'open',
    isActive: true,
    deletedAt: null
  };

  if (userSkills.length > 0) {
    query.skills = { $in: userSkills };
  }

  const jobs = await Job.find(query)
    .populate('client', 'name avatar companyName')
    .sort({ createdAt: -1 })
    .limit(10);

  return jobs;
};
