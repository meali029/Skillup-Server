import Proposal from "../../models/Proposal.js";
import Job from "../../models/Job.js";
import User from "../../models/User.js";
import { AppError } from "../../core/errors/index.js";

export const createProposal = async (userId, proposalData) => {
  const { jobId, coverLetter, bidAmount, deliveryTime, attachments } = proposalData;

  const user = await User.findById(userId);
  if (!user) {
    throw new AppError("User not found", 404);
  }
  if (user.role !== "freelancer") {
    throw new AppError("Only freelancers can submit proposals", 403);
  }

  const job = await Job.findById(jobId);
  if (!job) {
    throw new AppError("Job not found", 404);
  }
  if (job.status !== "open" || !job.isActive) {
    throw new AppError("This job is no longer accepting proposals", 400);
  }

  const existingProposal = await Proposal.findOne({
    freelancerId: userId,
    jobId: jobId,
  });

  // Only block if there's an active (non-withdrawn) proposal
  if (existingProposal && existingProposal.status !== 'withdrawn') {
    throw new AppError("You have already submitted a proposal for this job", 400);
  }

  // If there's a withdrawn proposal, delete it to allow resubmission
  // This handles the unique index constraint on (freelancerId, jobId)
  if (existingProposal && existingProposal.status === 'withdrawn') {
    await Proposal.findByIdAndDelete(existingProposal._id);
  }

  if (job.budgetMin && bidAmount < job.budgetMin) {
    throw new AppError(`Bid amount must be at least $${job.budgetMin}`, 400);
  }
  if (job.budgetMax && bidAmount > job.budgetMax) {
    throw new AppError(`Bid amount cannot exceed $${job.budgetMax}`, 400);
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

  return populatedProposal;
};

export const getProposalById = async (proposalId, userId) => {
  const proposal = await Proposal.findById(proposalId)
    .populate("jobId", "title description budget budgetMin budgetMax client status")
    .populate("freelancerId", "name email avatar skills hourlyRate");

  if (!proposal) {
    throw new AppError("Proposal not found", 404);
  }

  if (proposal.freelancerId._id.toString() !== userId.toString()) {
    throw new AppError("You don't have permission to view this proposal", 403);
  }

  return proposal;
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
    throw new AppError("Proposal not found", 404);
  }

  if (proposal.freelancerId.toString() !== userId.toString()) {
    throw new AppError("You don't have permission to update this proposal", 403);
  }

  if (proposal.status !== "pending") {
    throw new AppError("You can only edit proposals that are pending", 400);
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
    throw new AppError("Proposal not found", 404);
  }

  if (proposal.freelancerId.toString() !== userId.toString()) {
    throw new AppError("You don't have permission to withdraw this proposal", 403);
  }

  if (proposal.status !== "pending") {
    throw new AppError("You can only withdraw proposals that are pending", 400);
  }

  proposal.status = "withdrawn";
  await proposal.save();

  // Decrement job's proposalsCount
  await Job.findByIdAndUpdate(proposal.jobId, {
    $inc: { proposalsCount: -1 }
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
    throw new AppError("Job not found", 404);
  }
  
  // Handle both ObjectId and populated client object
  const jobClientId = job.client?._id || job.client;
  
  if (jobClientId.toString() !== clientId.toString()) {
    throw new AppError("You don't have permission to view proposals for this job", 403);
  }

  const { status, page = 1, limit = 10, sortBy = "createdAt", sortOrder = "desc" } = filters;

  const query = { jobId };
  if (status) {
    query.status = status;
  }

  const skip = (page - 1) * limit;
  const sortOptions = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

  const proposals = await Proposal.find(query)
    .populate("freelancerId", "name email avatar skills hourlyRate experience bio location")
    .populate("jobId", "title description budget budgetMin budgetMax")
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

export const getClientProposalById = async (proposalId, clientId) => {
  const proposal = await Proposal.findById(proposalId)
    .populate("freelancerId", "name email avatar skills hourlyRate experience bio location")
    .populate("jobId", "title description budget budgetMin budgetMax client");

  if (!proposal) {
    throw new AppError("Proposal not found", 404);
  }

  // Verify the job belongs to this client
  if (proposal.jobId.client.toString() !== clientId.toString()) {
    throw new AppError("You don't have permission to view this proposal", 403);
  }

  return proposal;
};

export const acceptProposal = async (proposalId, clientId) => {
  const proposal = await Proposal.findById(proposalId).populate("jobId");

  if (!proposal) {
    throw new AppError("Proposal not found", 404);
  }

  // Verify the job belongs to this client
  if (proposal.jobId.client.toString() !== clientId.toString()) {
    throw new AppError("You don't have permission to accept this proposal", 403);
  }

  if (proposal.status !== "pending") {
    throw new AppError(`Cannot accept a proposal that is already ${proposal.status}`, 400);
  }

  proposal.status = "accepted";
  await proposal.save();

  // Optionally: Reject all other pending proposals for this job
  await Proposal.updateMany(
    { 
      jobId: proposal.jobId._id, 
      _id: { $ne: proposalId },
      status: "pending" 
    },
    { status: "rejected" }
  );

  return await Proposal.findById(proposalId)
    .populate("freelancerId", "name email avatar skills")
    .populate("jobId", "title description");
};

export const rejectProposal = async (proposalId, clientId, reason = null) => {
  const proposal = await Proposal.findById(proposalId).populate("jobId");

  if (!proposal) {
    throw new AppError("Proposal not found", 404);
  }

  // Verify the job belongs to this client
  if (proposal.jobId.client.toString() !== clientId.toString()) {
    throw new AppError("You don't have permission to reject this proposal", 403);
  }

  if (proposal.status !== "pending") {
    throw new AppError(`Cannot reject a proposal that is already ${proposal.status}`, 400);
  }

  proposal.status = "rejected";
  if (reason) {
    proposal.rejectionReason = reason;
  }
  await proposal.save();

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
