import Job from '../../models/Job.js';
import User from '../../models/User.js';
import Proposal from '../../models/Proposal.js';
import { AppError } from '../../core/errors/index.js';
import matchingService from '../../services/matching/matching.service.js';
import aiService from '../../services/ai/ai.service.js';
import freelancerHistoryService from '../../services/freelancer-history.service.js';

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

  // If user has skills, filter by skills; otherwise get all open jobs
  if (userSkills.length > 0) {
    query.skills = { $in: userSkills };
  }

  // Get more jobs than needed for better ranking
  const jobs = await Job.find(query)
    .populate('client', 'name avatar companyName')
    .limit(50); // Get more for better AI ranking

  // Use matching service to rank jobs
  const rankedJobs = await matchingService.rankJobs(jobs, user, true);
  
  // Filter by minimum match score and return top 10
  const filteredJobs = matchingService.filterJobsByMatchScore(rankedJobs, 20);
  
  return filteredJobs.slice(0, 10);
};

/**
 * Get recommended freelancers for a job (based on proposals)
 * @param {string} jobId - Job ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Ranked freelancers with proposal data
 */
export const getRecommendedFreelancers = async (jobId, options = {}) => {
  const { limit = 10, minScore = 0 } = options;

  const job = await Job.findById(jobId)
    .populate('client', 'name avatar companyName');
  
  if (!job) {
    throw AppError('Job not found', 404);
  }

  if (job.status !== 'open') {
    throw AppError('Job is not open for proposals', 400);
  }

  // Get all pending proposals for this job
  const proposals = await Proposal.find({
    jobId: jobId,
    status: 'pending',
  })
    .populate('freelancerId', '-password -resetPasswordOTP -resetPasswordOTPExpires -cnic')
    .sort({ createdAt: -1 })
    .lean();

  console.log(`[Recommendations] Found ${proposals.length} pending proposals for job ${jobId}`);

  if (proposals.length === 0) {
    console.log('[Recommendations] No proposals found for this job');
    return [];
  }

  // Filter out inactive or banned freelancers
  const validProposals = proposals.filter(proposal => {
    const freelancer = proposal.freelancerId;
    return freelancer && 
           freelancer.isActive !== false && 
           freelancer.isBanned !== true &&
           freelancer.role === 'freelancer';
  });

  console.log(`[Recommendations] ${validProposals.length} valid proposals after filtering`);

  if (validProposals.length === 0) {
    return [];
  }

  // Get unique freelancer IDs (in case of multiple proposals from same freelancer)
  const freelancerIds = [...new Set(validProposals.map(p => p.freelancerId._id?.toString() || p.freelancerId.toString()))];

  // Get contract history for all freelancers in batch
  const contractHistoryMap = await freelancerHistoryService.getBatchContractHistory(freelancerIds);

  // Combine proposal, freelancer, and contract history data
  const proposalsWithData = validProposals.map(proposal => {
    const freelancerId = proposal.freelancerId._id?.toString() || proposal.freelancerId.toString();
    const contractHistory = contractHistoryMap.get(freelancerId) || freelancerHistoryService.getEmptyStats();
    
    return {
      proposal: {
        _id: proposal._id,
        id: proposal._id,
        coverLetter: proposal.coverLetter,
        bidAmount: proposal.bidAmount,
        deliveryTime: proposal.deliveryTime,
        createdAt: proposal.createdAt,
      },
      freelancer: proposal.freelancerId,
      contractHistory,
    };
  });

  try {
    // Use AI to rank proposals based on proposal quality, profile, and contract history
    const aiRankings = await aiService.rankProposalsWithAI(job, proposalsWithData);
    
    console.log(`[Recommendations] AI ranked ${aiRankings.length} proposals`);

    // Transform to expected format with proposal data included
    const rankedFreelancers = aiRankings.map((ranking) => {
      const freelancer = ranking.freelancer;
      const proposal = ranking.proposal;
      const contractHistory = ranking.contractHistory;
      
      return {
        ...(freelancer.toObject ? freelancer.toObject() : { ...freelancer }),
        // Proposal data
        proposalId: proposal._id || proposal.id,
        proposalBidAmount: proposal.bidAmount,
        proposalDeliveryTime: proposal.deliveryTime,
        proposalCoverLetter: proposal.coverLetter,
        proposalCreatedAt: proposal.createdAt,
        // Contract history
        contractHistory: {
          totalContracts: contractHistory.totalContracts,
          completedContracts: contractHistory.completedContracts,
          successRate: contractHistory.successRate,
          onTimeDeliveryRate: contractHistory.onTimeDeliveryRate,
          disputeRate: contractHistory.disputeRate,
          totalEarned: contractHistory.totalEarned,
          hasHistory: contractHistory.hasHistory,
        },
        // AI ranking data
        matchScore: ranking.aiScore,
        aiScore: ranking.aiScore,
        matchConfidence: ranking.confidence || 0,
        matchReasoning: ranking.reasoning || 'AI recommendation based on proposal, profile, and contract history',
        aiEnhanced: true,
        strengths: ranking.strengths || [],
        concerns: ranking.concerns || [],
        proposalQuality: ranking.proposalQuality || {},
        profileMatch: ranking.profileMatch || {},
        trackRecord: ranking.trackRecord || {},
      };
    });

    // Filter by minimum match score
    const filteredFreelancers = rankedFreelancers.filter(f => {
      const score = f.matchScore || f.aiScore || 0;
      return score >= minScore;
    });
    
    console.log(`[Recommendations] After filtering (minScore=${minScore}): ${filteredFreelancers.length} freelancers`);

    return filteredFreelancers.slice(0, limit);
  } catch (error) {
    console.error('[Recommendations] AI recommendation failed:', error);
    
    // Fallback: Return proposals sorted by creation date (newest first)
    // Include basic proposal data even without AI ranking
    const fallbackResults = proposalsWithData.map(({ proposal, freelancer, contractHistory }) => ({
      ...(freelancer.toObject ? freelancer.toObject() : { ...freelancer }),
      proposalId: proposal._id || proposal.id,
      proposalBidAmount: proposal.bidAmount,
      proposalDeliveryTime: proposal.deliveryTime,
      proposalCoverLetter: proposal.coverLetter,
      proposalCreatedAt: proposal.createdAt,
      contractHistory: {
        totalContracts: contractHistory.totalContracts,
        completedContracts: contractHistory.completedContracts,
        successRate: contractHistory.successRate,
        hasHistory: contractHistory.hasHistory,
      },
      matchScore: 50, // Default score
      aiScore: 0,
      matchConfidence: 0,
      matchReasoning: 'AI ranking unavailable, showing proposals in order received',
      aiEnhanced: false,
      strengths: [],
      concerns: [],
    }));

    // Sort by proposal creation date (newest first)
    fallbackResults.sort((a, b) => {
      const dateA = new Date(a.proposalCreatedAt || 0);
      const dateB = new Date(b.proposalCreatedAt || 0);
      return dateB - dateA;
    });

    const filtered = fallbackResults.filter(f => f.matchScore >= minScore);
    return filtered.slice(0, limit);
  }
};
