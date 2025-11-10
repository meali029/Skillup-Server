import proposalService from "./proposal.service.js";
import { asyncHandler, successResponse, paginatedResponse } from "../../core/utils/index.js";

/**
 * Submit a new proposal
 * @route POST /api/proposals
 * @access Private (Freelancers only)
 */
export const submitProposal = asyncHandler(async (req, res) => {
  const proposal = await proposalService.createProposal(req.user.id, req.validatedData || req.body);
  successResponse(res, { proposal }, "Proposal submitted successfully", 201);
});

/**
 * Get all proposals by logged-in freelancer
 * @route GET /api/proposals/me
 * @access Private (Freelancers only)
 */
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

/**
 * Get proposal by ID
 * @route GET /api/proposals/:id
 * @access Private (Freelancers only - own proposals)
 */
export const getProposalDetails = asyncHandler(async (req, res) => {
  const proposal = await proposalService.getProposalById(req.params.id, req.user.id);
  successResponse(res, { proposal }, "Proposal fetched successfully");
});

/**
 * Update proposal
 * @route PUT /api/proposals/:id
 * @access Private (Freelancers only - own proposals)
 */
export const updateProposal = asyncHandler(async (req, res) => {
  const proposal = await proposalService.updateProposal(
    req.params.id,
    req.user.id,
    req.validatedData || req.body
  );
  successResponse(res, { proposal }, "Proposal updated successfully");
});

/**
 * Withdraw proposal
 * @route DELETE /api/proposals/:id
 * @access Private (Freelancers only - own proposals)
 */
export const withdrawProposal = asyncHandler(async (req, res) => {
  const result = await proposalService.withdrawProposal(req.params.id, req.user.id);
  successResponse(res, result, "Proposal withdrawn successfully");
});

/**
 * Get proposal statistics
 * @route GET /api/proposals/stats
 * @access Private (Freelancers only)
 */
export const getProposalStats = asyncHandler(async (req, res) => {
  const stats = await proposalService.getProposalStats(req.user.id);
  successResponse(res, { stats }, "Proposal statistics fetched successfully");
});

/**
 * Check if freelancer has applied to a job
 * @route GET /api/proposals/check/:jobId
 * @access Private (Freelancers only)
 */
export const checkIfApplied = asyncHandler(async (req, res) => {
  const hasApplied = await proposalService.hasApplied(req.user.id, req.params.jobId);
  successResponse(res, { hasApplied }, "Check completed successfully");
});
