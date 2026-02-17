import * as proposalService from "./proposal.service.js";
import { asyncHandler, successResponse, paginatedResponse } from "../../core/utils/index.js";
import { formatUser } from "../shared/dtos/index.js";

export const submitProposal = asyncHandler(async (req, res) => {
  const proposal = await proposalService.createProposal(req.user.id, req.validatedData || req.body);
  successResponse(res, { proposal }, "Proposal submitted successfully", 201);
});

export const getMyProposals = asyncHandler(async (req, res) => {
  const { status, page, limit, sortBy, sortOrder } = req.query;
  
  const result = await proposalService.getFreelancerProposals(req.user.id, {
    status,
    page,
    limit,
    sortBy,
    sortOrder,
  });

  paginatedResponse(
    res,
    result.proposals,
    result.pagination.page,
    result.pagination.limit,
    result.pagination.total
  );
});

export const getProposalDetails = asyncHandler(async (req, res) => {
  const proposal = await proposalService.getProposalById(req.params.id, req.user.id);
  successResponse(res, { proposal }, "Proposal fetched successfully");
});

export const updateProposal = asyncHandler(async (req, res) => {
  const proposal = await proposalService.updateProposal(
    req.params.id,
    req.user.id,
    req.validatedData || req.body
  );
  successResponse(res, { proposal }, "Proposal updated successfully");
});

export const withdrawProposal = asyncHandler(async (req, res) => {
  const result = await proposalService.withdrawProposal(req.params.id, req.user.id);
  successResponse(res, result, "Proposal withdrawn successfully");
});

export const getProposalStats = asyncHandler(async (req, res) => {
  const stats = await proposalService.getProposalStats(req.user.id);
  successResponse(res, { stats }, "Proposal statistics fetched successfully");
});

export const checkIfApplied = asyncHandler(async (req, res) => {
  const result = await proposalService.hasApplied(req.user.id, req.params.jobId);
  successResponse(res, result, "Check completed successfully");
});


export const getJobProposals = asyncHandler(async (req, res) => {
  const { status, page, limit, sortBy, sortOrder } = req.query;
  
  const result = await proposalService.getJobProposals(req.params.jobId, req.user.id, {
    status,
    page,
    limit,
    sortBy,
    sortOrder,
  });

  paginatedResponse(
    res,
    result.proposals,
    result.pagination.page,
    result.pagination.limit,
    result.pagination.total
  );
});

export const getClientProposalDetails = asyncHandler(async (req, res) => {
  // Fetch and mark client view (notify freelancer once)
  let proposal = await proposalService.getClientProposalById(req.params.id, req.user.id);
  try {
    proposal = await proposalService.clientViewedProposalAndNotify(req.params.id, req.user.id);
  } catch (err) {
    // Non-fatal: continue to return the proposal

  }

  // Format the proposal to include profileCompleteness for freelancer
  const formattedProposal = proposal.toObject();
  if (formattedProposal.freelancerId) {
    formattedProposal.freelancerId = formatUser(proposal.freelancerId);
  }
  
  // Ensure job has proper id field for frontend
  if (formattedProposal.jobId && formattedProposal.jobId._id) {
    formattedProposal.jobId = {
      ...formattedProposal.jobId,
      id: formattedProposal.jobId._id.toString(),
    };
  }

  successResponse(res, { proposal: formattedProposal }, "Proposal fetched successfully");
});

export const acceptProposal = asyncHandler(async (req, res) => {
  const result = await proposalService.acceptProposal(req.params.id, req.user.id);
  successResponse(res, { 
    proposal: result.proposal, 
    conversation: result.conversation 
  }, "Proposal accepted successfully");
});

export const rejectProposal = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const proposal = await proposalService.rejectProposal(req.params.id, req.user.id, reason);
  successResponse(res, { proposal }, "Proposal rejected successfully");
});

export const getAllClientProposals = asyncHandler(async (req, res) => {
  const { status, page, limit, sortBy, sortOrder } = req.query;
  
  const result = await proposalService.getAllClientProposals(req.user.id, {
    status,
    page,
    limit,
    sortBy,
    sortOrder,
  });

  successResponse(res, { 
    proposals: result.proposals, 
    stats: result.stats,
    pagination: result.pagination 
  }, "Proposals fetched successfully");
});

/**
 * Generate AI proposal draft
 */
export const generateProposalDraft = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const draft = await proposalService.generateProposalDraft(jobId, req.user.id);
  successResponse(res, draft, 'Proposal draft generated successfully');
});

/**
 * Regenerate AI proposal draft
 */
export const regenerateProposalDraft = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const draft = await proposalService.regenerateProposalDraft(jobId, req.user.id);
  successResponse(res, draft, 'Proposal draft regenerated successfully');
});

/**
 * Get weekly proposal limit status
 * Returns how many proposals the freelancer has used and how many remain
 */
export const getProposalLimitStatus = asyncHandler(async (req, res) => {
  const limitStatus = await proposalService.getProposalLimitStatus(req.user.id);
  successResponse(res, { limitStatus }, "Proposal limit status retrieved successfully");
});