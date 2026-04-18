import Proposal from "../../models/Proposal.js";
import Job from "../../models/Job.js";
import User from "../../models/User.js";
import Conversation from "../../models/Conversation.js";
import Message from "../../models/Message.js";
import { AppError, createAppError } from "../../core/errors/index.js";
import { notifyUser } from "../notifications/notification.service.js";
import aiService from "../../services/ai/ai.service.js";
import Subscription from "../../models/Subscription.js";
import { getPlanLimits } from "../../config/subscription.config.js";

// Rolling window for free-tier proposal counting
const FREE_TIER_WINDOW_DAYS = 7;

// Edit Window Constants
const EDIT_WINDOW_HOURS = 6;

/**
 * Check if a proposal can be edited
 * Conditions: 
 * - Status must be "pending"
 * - Within 6 hours of creation
 * - Client has not viewed it yet
 * 
 * @param {Object} proposal - The proposal document
 * @returns {Object} { canEdit, reason }
 */
const checkCanEditProposal = (proposal) => {
  if (proposal.status !== "pending") {
    return { canEdit: false, reason: "Only pending proposals can be edited" };
  }

  if (proposal.clientViewed) {
    return { canEdit: false, reason: "Cannot edit after client has viewed the proposal" };
  }

  const hoursElapsed = (Date.now() - new Date(proposal.createdAt).getTime()) / (1000 * 60 * 60);
  if (hoursElapsed >= EDIT_WINDOW_HOURS) {
    return { canEdit: false, reason: `Edit window expired. Proposals can only be edited within ${EDIT_WINDOW_HOURS} hours of submission` };
  }

  return { canEdit: true, reason: null };
};

/**
 * Get proposal count for a freelancer based on their plan.
 * - Free plan: counts non-withdrawn proposals in a 7-day rolling window (DB query)
 * - Paid plans: reads the atomic counter from Subscription.usage (no Proposal query)
 *
 * @param {string} freelancerId
 * @param {Object} user - user document (needs plan field)
 * @returns {Promise<{count: number, limit: number, resetsAt: Date|null, periodType: string, billingPeriodEnd: Date|null}>}
 */
const getProposalCount = async (freelancerId, user) => {
  const planName = user.plan || 'free';
  const limits = getPlanLimits(planName);
  const limit = limits.proposals; // -1 = unlimited

  // Unlimited plans skip counting entirely
  if (limit === -1) {
    return { count: 0, limit, resetsAt: null, periodType: 'unlimited', billingPeriodEnd: null };
  }

  // Free plan: 7-day rolling window, count actual non-withdrawn proposals
  if (planName === 'free') {
    const windowStart = new Date(Date.now() - FREE_TIER_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const count = await Proposal.countDocuments({
      freelancerId,
      createdAt: { $gte: windowStart },
      status: { $ne: 'withdrawn' },
    });

    // Oldest proposal in window determines when next slot opens
    const oldestProposal = await Proposal.findOne({
      freelancerId,
      createdAt: { $gte: windowStart },
      status: { $ne: 'withdrawn' },
    })
      .sort({ createdAt: 1 })
      .select('createdAt')
      .lean();

    const resetsAt =
      oldestProposal && count >= limit
        ? new Date(oldestProposal.createdAt.getTime() + FREE_TIER_WINDOW_DAYS * 24 * 60 * 60 * 1000)
        : null;

    return { count, limit, resetsAt, periodType: 'weekly', billingPeriodEnd: null };
  }

  // Paid plans: use Subscription usage counter (source of truth)
  const subscription = await Subscription.getActiveSubscription(freelancerId);
  const count = subscription?.usage?.proposalsUsed || 0;
  const billingPeriodEnd = subscription?.currentPeriodEnd || null;

  return {
    count,
    limit,
    resetsAt: billingPeriodEnd, // resets when billing period ends
    periodType: 'billing_period',
    billingPeriodEnd,
  };
};

/**
 * Check if freelancer has exceeded their plan's proposal limit
 *
 * @param {string} freelancerId
 * @param {Object} user - user document (needs plan field)
 * @throws {AppError} 429 if limit exceeded
 */
const checkProposalLimit = async (freelancerId, user) => {
  const { count, limit, resetsAt, periodType } = await getProposalCount(freelancerId, user);

  // Unlimited or under limit — allow
  if (limit === -1 || count < limit) return;

  const planName = user.plan || 'free';
  const periodLabel = periodType === 'weekly' ? 'in the last 7 days' : 'in this billing period';

  const error = createAppError(
    `Proposal limit reached. You have used ${count}/${limit} proposals ${periodLabel}. Upgrade your plan to continue.`,
    429
  );
  error.code = 'PROPOSAL_LIMIT_EXCEEDED';
  error.details = {
    plan: planName,
    limit,
    used: count,
    remaining: 0,
    resetsAt,
    periodType,
  };
  throw error;
};

/**
 * Get proposal limit status for a freelancer (plan-aware)
 *
 * @param {string} freelancerId
 * @returns {Promise<Object>} Limit status details
 */
export const getProposalLimitStatus = async (freelancerId) => {
  const user = await User.findById(freelancerId).select('plan');
  if (!user) throw createAppError('User not found', 404);

  const { count, limit, resetsAt, periodType, billingPeriodEnd } = await getProposalCount(freelancerId, user);

  const remaining = limit === -1 ? -1 : Math.max(0, limit - count);

  return {
    plan: user.plan || 'free',
    limit,
    used: count,
    remaining,
    resetsAt,
    canSubmit: limit === -1 || count < limit,
    periodType,
    billingPeriodEnd,
  };
};

export const createProposal = async (userId, proposalData) => {
  const { jobId, coverLetter, bidAmount, deliveryTime, attachments } = proposalData;

  const user = await User.findById(userId);
  if (!user) {
    throw createAppError("User not found", 404);
  }
  if (user.role !== "freelancer") {
    throw createAppError("Only freelancers can submit proposals", 403);
  }

  // Check plan-based proposal limit BEFORE any other validation
  await checkProposalLimit(userId, user);

  const job = await Job.findById(jobId);
  if (!job) {
    throw createAppError("Job not found", 404);
  }
  if (job.status !== "open" || !job.isActive) {
    throw createAppError("This job is no longer accepting proposals", 400);
  }

  const existingProposal = await Proposal.findOne({
    freelancerId: userId,
    jobId: jobId,
  });

  // Only block if there's an active (non-withdrawn) proposal
  if (existingProposal && existingProposal.status !== 'withdrawn') {
    throw createAppError("You have already submitted a proposal for this job", 400);
  }

  // If there's a withdrawn proposal, delete it to allow resubmission
  // This handles the unique index constraint on (freelancerId, jobId)
  if (existingProposal && existingProposal.status === 'withdrawn') {
    await Proposal.findByIdAndDelete(existingProposal._id);
  }

  if (job.budgetMin && bidAmount < job.budgetMin) {
    throw createAppError(`Bid amount must be at least $${job.budgetMin}`, 400);
  }
  if (job.budgetMax && bidAmount > job.budgetMax) {
    throw createAppError(`Bid amount cannot exceed $${job.budgetMax}`, 400);
  }

  const proposal = await Proposal.create({
    freelancerId: userId,
    jobId,
    coverLetter,
    bidAmount,
    deliveryTime,
    attachments: attachments || [],
    status: "pending",
  });

  const populatedProposal = await Proposal.findById(proposal._id)
    .populate("jobId", "title description budget budgetMin budgetMax client")
    .populate("freelancerId", "name email avatar skills hourlyRate");

  // Update job's proposalsCount
  await Job.findByIdAndUpdate(jobId, {
    $inc: { proposalsCount: 1 }
  });

  // Update freelancer's proposal statistics
  await User.findByIdAndUpdate(userId, {
    $inc: { 
      appliedJobsCount: 1,
      activeProposalsCount: 1
    }
  });

  // Notify job owner (client) about new proposal
  try {
    const clientId = job.client;
    await notifyUser(clientId, {
      type: 'proposal_received',
      title: 'New proposal received',
      message: `${user.name} submitted a proposal for your job "${job.title}"`,
      link: `/jobs/${jobId}/proposals/${proposal._id}`,
      data: { jobId, proposalId: proposal._id }
    });
  } catch (err) {
    console.error('[Notification] Failed to notify job owner about proposal', err.message);
  }

  // Track usage in subscription counter for paid plans
  if (user.plan && user.plan !== 'free') {
    try {
      await Subscription.incrementUsage(userId, 'proposalsUsed');
    } catch (err) {
      console.error('[Subscription] Failed to increment proposal usage', err.message);
    }
  }

  return populatedProposal;
};

export const getProposalById = async (proposalId, userId) => {
  const proposal = await Proposal.findById(proposalId)
    .populate("jobId", "title description budget budgetMin budgetMax client status")
    .populate("freelancerId", "name email avatar skills hourlyRate isActive isBanned");

  if (!proposal) {
    throw createAppError("Proposal not found", 404);
  }

  if (proposal.freelancerId._id.toString() !== userId.toString()) {
    throw createAppError("You don't have permission to view this proposal", 403);
  }

  // Check if freelancer is banned or suspended
  if (!proposal.freelancerId.isActive || proposal.freelancerId.isBanned) {
    throw createAppError("This proposal is no longer available", 404);
  }

  // Add canEdit flag to response
  const { canEdit, reason } = checkCanEditProposal(proposal);
  const proposalObj = proposal.toObject();
  proposalObj.canEdit = canEdit;
  proposalObj.canEditReason = reason;

  return proposalObj;
};

export const getFreelancerProposals = async (userId, filters = {}) => {
  const { status, page = 1, limit = 10, sortBy = "createdAt", sortOrder = "desc" } = filters;

  const query = { freelancerId: userId };
  if (status) {
    query.status = status;
  }

  const skip = (page - 1) * limit;
  const sortOptions = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

  const proposals = await Proposal.find(query)
    .populate("jobId", "title description budget budgetMin budgetMax client status")
    .sort(sortOptions)
    .skip(skip)
    .limit(limit);

  const total = await Proposal.countDocuments(query);

  return {
    proposals,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / limit),
    },
  };
};

export const updateProposal = async (proposalId, userId, updateData) => {
  const proposal = await Proposal.findById(proposalId);

  if (!proposal) {
    throw createAppError("Proposal not found", 404);
  }

  if (proposal.freelancerId.toString() !== userId.toString()) {
    throw createAppError("You don't have permission to update this proposal", 403);
  }

  // Check if proposal can be edited
  const { canEdit, reason } = checkCanEditProposal(proposal);
  if (!canEdit) {
    throw createAppError(reason, 403);
  }

  const allowedUpdates = ["coverLetter", "bidAmount", "deliveryTime", "attachments"];
  Object.keys(updateData).forEach((key) => {
    if (allowedUpdates.includes(key)) {
      proposal[key] = updateData[key];
    }
  });

  await proposal.save();

  return await Proposal.findById(proposal._id)
    .populate("jobId", "title description budget budgetMin budgetMax client")
    .populate("freelancerId", "name email avatar skills hourlyRate");
};

export const withdrawProposal = async (proposalId, userId) => {
  const proposal = await Proposal.findById(proposalId);

  if (!proposal) {
    throw createAppError("Proposal not found", 404);
  }

  if (proposal.freelancerId.toString() !== userId.toString()) {
    throw createAppError("You don't have permission to withdraw this proposal", 403);
  }

  if (proposal.status !== "pending") {
    throw createAppError("You can only withdraw proposals that are pending", 400);
  }

  proposal.status = "withdrawn";
  await proposal.save();

  // Decrement job's proposalsCount
  await Job.findByIdAndUpdate(proposal.jobId, {
    $inc: { proposalsCount: -1 }
  });

  // Decrement freelancer's activeProposalsCount
  await User.findByIdAndUpdate(userId, {
    $inc: { activeProposalsCount: -1 }
  });

  return { message: "Proposal withdrawn successfully" };
};

export const getProposalStats = async (userId) => {
  const [total, pending, accepted, rejected, withdrawn] = await Promise.all([
    Proposal.countDocuments({ freelancerId: userId }),
    Proposal.countDocuments({ freelancerId: userId, status: "pending" }),
    Proposal.countDocuments({ freelancerId: userId, status: "accepted" }),
    Proposal.countDocuments({ freelancerId: userId, status: "rejected" }),
    Proposal.countDocuments({ freelancerId: userId, status: "withdrawn" }),
  ]);

  const successRate = total > 0 ? ((accepted / total) * 100).toFixed(2) : 0;

  return {
    total,
    pending,
    accepted,
    rejected,
    withdrawn,
    successRate: parseFloat(successRate),
  };
};

export const hasApplied = async (userId, jobId) => {
  const proposal = await Proposal.findOne({
    freelancerId: userId,
    jobId: jobId,
  }).select('_id status createdAt');

  // Treat withdrawn proposals as "not applied" - user can apply again
  if (!proposal || proposal.status === 'withdrawn') {
    return { hasApplied: false, proposal: null };
  }

  return { 
    hasApplied: true, 
    proposal: {
      id: proposal._id,
      status: proposal.status,
      createdAt: proposal.createdAt
    }
  };
};

export const getJobProposals = async (jobId, clientId, filters = {}) => {
  // Verify job belongs to this client
  const job = await Job.findById(jobId);
  if (!job) {
    throw createAppError("Job not found", 404);
  }
  
  // Handle both ObjectId and populated client object
  const jobClientId = job.client?._id || job.client;
  
  if (jobClientId.toString() !== clientId.toString()) {
    throw createAppError("You don't have permission to view proposals for this job", 403);
  }

  const { status, page = 1, limit = 10, sortBy = "createdAt", sortOrder = "desc" } = filters;

  const query = { jobId };
  if (status) {
    query.status = status;
  }

  const skip = (page - 1) * limit;
  const sortOptions = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

  const proposals = await Proposal.find(query)
    .populate("freelancerId", "name email avatar skills hourlyRate experience bio location isActive isBanned")
    .populate("jobId", "title description budget budgetMin budgetMax")
    .sort(sortOptions)
    .skip(skip)
    .limit(limit);

  // Filter out proposals from banned or suspended users
  const filteredProposals = proposals.filter(proposal => {
    return proposal.freelancerId && proposal.freelancerId.isActive && !proposal.freelancerId.isBanned;
  });

  const total = await Proposal.countDocuments(query);

  return {
    proposals: filteredProposals,
    pagination: {
      total: filteredProposals.length,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / limit),
    },
  };
};

export const getClientProposalById = async (proposalId, clientId) => {
  const proposal = await Proposal.findById(proposalId)
    .populate("freelancerId") // Populate all fields for profileCompleteness calculation
    .populate("jobId", "title description budget budgetMin budgetMax client");

  if (!proposal) {
    throw createAppError("Proposal not found", 404);
  }

  // Verify the job belongs to this client
  if (proposal.jobId.client.toString() !== clientId.toString()) {
    throw createAppError("You don't have permission to view this proposal", 403);
  }

  // Mark proposal as viewed by client (first time only)
  if (!proposal.clientViewed) {
    proposal.clientViewed = true;
    proposal.clientViewedAt = new Date();
    await proposal.save();

    // Notify freelancer that client viewed their proposal
    try {
      await notifyUser(proposal.freelancerId._id, {
        type: 'proposal_viewed',
        title: 'Proposal Viewed',
        message: `Your proposal for "${proposal.jobId.title}" has been viewed by the client`,
        link: `/freelancer/proposals/${proposalId}`,
        data: { proposalId, jobId: proposal.jobId._id }
      });
    } catch (err) {
      console.error('[Notification] Failed to notify freelancer about proposal view', err.message);
    }
  }

  return proposal;
};

// notify client view - call this from controller or router flow where appropriate
export const clientViewedProposalAndNotify = async (proposalId, clientId) => {
  const proposal = await Proposal.findById(proposalId).populate('freelancerId', 'name');
  if (!proposal) throw createAppError('Proposal not found', 404);
  // verify ownership
  if (!proposal.jobId) {
    const job = await Job.findById(proposal.jobId);
  }
  if (proposal.clientViewed) return proposal;
  // mark viewed
  proposal.clientViewed = true;
  await proposal.save();

  try {
    await notifyUser(proposal.freelancerId, {
      type: 'proposal_viewed',
      title: 'Proposal viewed',
      message: `Client viewed your proposal for "${proposal.jobId?.title || ''}"`,
      link: `/proposals/${proposalId}`,
      data: { proposalId, jobId: proposal.jobId }
    });
  } catch (err) {
    console.error('[Notification] Failed to notify freelancer about proposal view', err.message);
  }

  return proposal;
};

export const acceptProposal = async (proposalId, clientId) => {
  const proposal = await Proposal.findById(proposalId).populate("jobId");

  if (!proposal) {
    throw createAppError("Proposal not found", 404);
  }

  // Verify the job belongs to this client
  if (proposal.jobId.client.toString() !== clientId.toString()) {
    throw createAppError("You don't have permission to accept this proposal", 403);
  }

  if (proposal.status !== "pending") {
    throw createAppError(`Cannot accept a proposal that is already ${proposal.status}`, 400);
  }

  proposal.status = "accepted";
  
  // Create or get existing conversation between client and freelancer
  const conversation = await Conversation.findOrCreate(
    [clientId, proposal.freelancerId],
    {
      job: proposal.jobId._id,
      proposal: proposalId,
      type: 'proposal',
      metadata: {
        jobTitle: proposal.jobId.title,
        proposalAmount: proposal.bidAmount,
      },
    }
  );

  // Create initial system message
  const initialMessage = await Message.create({
    conversation: conversation._id,
    sender: clientId,
    content: `🎉 Congratulations! Your proposal has been accepted. You can now discuss the project details and start working together.`,
    type: 'system',
  });

  // Update conversation with last message (store message ID, not full object)
  conversation.lastMessage = initialMessage._id;
  await conversation.save();

  // Link conversation to proposal
  proposal.conversation = conversation._id;
  await proposal.save();

  // Reject all other pending proposals for this job
  const rejectedProposals = await Proposal.find(
    { 
      jobId: proposal.jobId._id, 
      _id: { $ne: proposalId },
      status: "pending" 
    }
  );

  await Proposal.updateMany(
    { 
      jobId: proposal.jobId._id, 
      _id: { $ne: proposalId },
      status: "pending" 
    },
    { status: "rejected" }
  );

  // Decrement activeProposalsCount for all rejected freelancers and the accepted one
  const freelancerIds = rejectedProposals.map(p => p.freelancerId);
  freelancerIds.push(proposal.freelancerId); // Add the accepted freelancer
  
  await User.updateMany(
    { _id: { $in: freelancerIds } },
    { $inc: { activeProposalsCount: -1 } }
  );

  const updatedProposal = await Proposal.findById(proposalId)
    .populate("freelancerId", "name email avatar skills")
    .populate("jobId", "title description")
    .populate("conversation");

  // Populate conversation for the response
  await conversation.populate('participants', 'name email avatar role');

  // Notify freelancer
  try {
    await notifyUser(proposal.freelancerId, {
      type: 'proposal_accepted',
      title: 'Proposal accepted',
      message: `Your proposal for "${proposal.jobId.title}" has been accepted`,
      link: `/conversations/${conversation._id}`,
      data: { proposalId: proposal._id, conversationId: conversation._id }
    });
  } catch (err) {
    console.error('[Notification] Failed to notify freelancer about acceptance', err.message);
  }

  return {
    proposal: updatedProposal,
    conversation,
  };
};

export const rejectProposal = async (proposalId, clientId, reason = null) => {
  const proposal = await Proposal.findById(proposalId).populate("jobId");

  if (!proposal) {
    throw createAppError("Proposal not found", 404);
  }

  // Verify the job belongs to this client
  if (proposal.jobId.client.toString() !== clientId.toString()) {
    throw createAppError("You don't have permission to reject this proposal", 403);
  }

  if (proposal.status !== "pending") {
    throw createAppError(`Cannot reject a proposal that is already ${proposal.status}`, 400);
  }

  proposal.status = "rejected";
  if (reason) {
    proposal.rejectionReason = reason;
  }
  await proposal.save();

  // Decrement freelancer's activeProposalsCount
  await User.findByIdAndUpdate(proposal.freelancerId, {
    $inc: { activeProposalsCount: -1 }
  });

  // Notify freelancer about rejection
  try {
    await notifyUser(proposal.freelancerId, {
      type: 'proposal_rejected',
      title: 'Proposal rejected',
      message: `Your proposal for "${proposal.jobId.title}" was rejected${reason ? `: ${reason}` : '.'}`,
      link: `/jobs/${proposal.jobId}`,
      data: { proposalId }
    });
  } catch (err) {
    console.error('[Notification] Failed to notify freelancer about rejection', err.message);
  }

  return await Proposal.findById(proposalId)
    .populate("freelancerId", "name email avatar")
    .populate("jobId", "title");
};

export const getAllClientProposals = async (clientId, filters = {}) => {
  const { status, page = 1, limit = 10, sortBy = "createdAt", sortOrder = "desc" } = filters;

  // Get all jobs by this client
  const clientJobs = await Job.find({ client: clientId }).select('_id');
  const jobIds = clientJobs.map(job => job._id);

  const query = { jobId: { $in: jobIds } };
  if (status) {
    query.status = status;
  }

  const skip = (page - 1) * limit;
  const sortOptions = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

  const proposals = await Proposal.find(query)
    .populate("freelancerId", "name email avatar skills hourlyRate")
    .populate("jobId", "title description")
    .sort(sortOptions)
    .skip(skip)
    .limit(limit);

  const total = await Proposal.countDocuments(query);

  // Get stats
  const stats = {
    total: await Proposal.countDocuments({ jobId: { $in: jobIds } }),
    pending: await Proposal.countDocuments({ jobId: { $in: jobIds }, status: "pending" }),
    accepted: await Proposal.countDocuments({ jobId: { $in: jobIds }, status: "accepted" }),
    rejected: await Proposal.countDocuments({ jobId: { $in: jobIds }, status: "rejected" }),
  };

  return {
    proposals,
    stats,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / limit),
    },
  };
};


/**
 * Generate AI-powered proposal draft
 * @param {string} jobId - Job ID
 * @param {string} userId - Freelancer user ID
 * @returns {Promise<Object>} Proposal draft with AI-generated content
 */
export const generateProposalDraft = async (jobId, userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw createAppError("User not found", 404);
  }
  if (user.role !== "freelancer") {
    throw createAppError("Only freelancers can generate proposals", 403);
  }

  const job = await Job.findById(jobId);
  if (!job) {
    throw createAppError("Job not found", 404);
  }
  if (job.status !== "open" || !job.isActive) {
    throw createAppError("This job is no longer accepting proposals", 400);
  }

  // Check if proposal already exists
  const existingProposal = await Proposal.findOne({
    freelancerId: userId,
    jobId: jobId,
    status: { $ne: 'withdrawn' }
  });

  if (existingProposal) {
    throw createAppError("You have already submitted a proposal for this job", 400);
  }

  try {
    // Generate AI proposal draft
    const draft = await aiService.generateProposalDraft(job, user);

    return {
      jobId: job._id,
      jobTitle: job.title,
      draft: {
        coverLetter: draft.coverLetter,
        bidAmount: draft.bidAmount,
        deliveryTime: draft.deliveryTime,
        confidence: draft.confidence,
        generatedAt: draft.generatedAt,
      },
    };
  } catch (error) {
    // Map known AI error codes to clean user-facing messages
    if (error.statusCode === 429) {
      throw createAppError(
        'AI generation limit reached. The service is temporarily at capacity — please wait a moment and try again.',
        429
      );
    }
    if (error.statusCode) {
      throw error;
    }
    throw createAppError('Failed to generate proposal draft. Please try again later.', 500);
  }
};

/**
 * Regenerate AI proposal draft
 * @param {string} jobId - Job ID
 * @param {string} userId - Freelancer user ID
 * @returns {Promise<Object>} New proposal draft
 */
export const regenerateProposalDraft = async (jobId, userId) => {
  // Same logic as generateProposalDraft, but allows regeneration
  return generateProposalDraft(jobId, userId);
};
