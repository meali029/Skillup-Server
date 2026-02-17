import contractService from './contract.service.js';
import asyncHandler from '../../core/utils/asyncHandler.js';
import { successResponse, paginatedResponse } from '../../core/utils/responseFormatter.js';
import AppError from '../../core/errors/AppError.js';

/**
 * @desc    Create contract from proposal
 * @route   POST /api/contracts/from-proposal
 * @access  Private (Client only)
 */
export const createFromProposal = asyncHandler(async (req, res) => {
  if (!req.user) {
    throw AppError('Not authenticated', 401);
  }
  
  // Auth middleware sets req.user.id (not _id)
  const userId = req.user.id;
  
  if (!userId) {
    throw AppError('User ID not found in session', 401);
  }
  
  const { proposalId, terms, deadline, milestones, paymentData } = req.body;
  
  const result = await contractService.createFromProposal(
    proposalId,
    userId,
    { terms, deadline, milestones },
    paymentData
  );
  
  // Check if result is object with contract property (new format) or just contract (old format)
  if (result.contract) {
    successResponse(res, result, 'Contract created successfully. Please complete payment.', 201);
  } else {
    successResponse(res, { contract: result }, 'Contract created successfully', 201);
  }
});

/**
 * @desc    Get all contracts for logged-in user
 * @route   GET /api/contracts
 * @access  Private
 */
export const getMyContracts = asyncHandler(async (req, res) => {
  const { status, role, page, limit, sortBy, order } = req.query;
  
  // Pass user's role to service for proper access control
  const result = await contractService.getContractsByUser(
    req.user.id,
    {
      status,
      role,
      page,
      limit,
      sortBy,
      order,
    },
    req.user.role // Pass user's actual role
  );

  if (result.pagination) {
    paginatedResponse(
      res,
      result.contracts,
      result.pagination.page,
      result.pagination.limit,
      result.pagination.total
    );
  } else {
    successResponse(res, { contracts: result.contracts }, 'Contracts retrieved successfully');
  }
});

/**
 * @desc    Get contract by ID
 * @route   GET /api/contracts/:id
 * @access  Private
 */
export const getContract = asyncHandler(async (req, res) => {
  // [CONTRACT][AUTH] Log user context before service call
  if (!req.user || !req.user.id) {
    throw AppError('Not authenticated', 401);
  }
  
  const contract = await contractService.getContractById(
    req.params.id,
    req.user.id
  );

  successResponse(res, { contract }, 'Contract retrieved successfully');
});

/**
 * @desc    Accept or decline contract
 * @route   POST /api/contracts/:id/respond
 * @access  Private (Freelancer only)
 */
export const respondToContract = asyncHandler(async (req, res) => {
  const { action, reason } = req.body;
  
  // Auth middleware already ensures req.user exists and is authenticated
  const contract = await contractService.respondToContract(
    req.params.id,
    req.user.id,
    action,
    reason
  );

  const message = action === 'accept' 
    ? 'Contract accepted successfully' 
    : 'Contract declined successfully';

  successResponse(res, { contract }, message);
});

/**
 * @desc    Add milestone to contract
 * @route   POST /api/contracts/:id/milestones
 * @access  Private (Client only)
 */
export const addMilestone = asyncHandler(async (req, res) => {
  const contract = await contractService.addMilestone(
    req.params.id,
    req.user.id,
    req.body
  );

  successResponse(res, { contract }, 'Milestone added successfully', 201);
});

/**
 * @desc    Update milestone
 * @route   PATCH /api/contracts/:id/milestones/:milestoneId
 * @access  Private
 */
export const updateMilestone = asyncHandler(async (req, res) => {
  const contract = await contractService.updateMilestone(
    req.params.id,
    req.params.milestoneId,
    req.user.id,
    req.body
  );

  successResponse(res, { contract }, 'Milestone updated successfully');
});

/**
 * @desc    Complete contract
 * @route   POST /api/contracts/:id/complete
 * @access  Private (Client only)
 */
export const completeContract = asyncHandler(async (req, res) => {
  const contract = await contractService.completeContract(
    req.params.id,
    req.user.id
  );

  successResponse(res, { contract }, 'Contract completed successfully');
});

/**
 * @desc    Cancel contract
 * @route   POST /api/contracts/:id/cancel
 * @access  Private
 */
export const cancelContract = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  
  const contract = await contractService.cancelContract(
    req.params.id,
    req.user.id,
    reason
  );

  successResponse(res, { contract }, 'Contract cancelled successfully');
});

/**
 * @desc    Get contract statistics
 * @route   GET /api/contracts/stats/me
 * @access  Private
 */
export const getMyStats = asyncHandler(async (req, res) => {
  const stats = await contractService.getContractStats(req.user.id);

  successResponse(res, { stats }, 'Statistics retrieved successfully');
});

/**
 * @desc    Fund milestone escrow
 * @route   POST /api/contracts/:id/milestones/:milestoneId/fund
 * @access  Private (Client only)
 */
export const fundMilestoneEscrow = asyncHandler(async (req, res) => {
  const { id: contractId, milestoneId } = req.params;
  const userId = req.user.id;
  const paymentData = req.body;

  const result = await contractService.fundMilestoneEscrow(
    contractId,
    milestoneId,
    userId,
    paymentData
  );

  successResponse(res, result, 'Payment initialized successfully');
});

/**
 * @desc    Approve milestone and release escrow
 * @route   POST /api/contracts/:id/milestones/:milestoneId/approve
 * @access  Private (Client only)
 */
export const approveMilestone = asyncHandler(async (req, res) => {
  const { id: contractId, milestoneId } = req.params;
  const userId = req.user.id;

  const contract = await contractService.approveMilestone(
    contractId,
    milestoneId,
    userId
  );

  successResponse(res, { contract }, 'Milestone approved and escrow released successfully');
});

/**
 * @desc    Verify contract payment
 * @route   POST /api/contracts/:id/verify-payment
 * @access  Private (Client only)
 */
export const verifyContractPayment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { callbackData, paymentMethod } = req.body;
  const userId = req.user.id;

  // Get contract
  const contract = await contractService.getContractById(id, userId);
  
  // Verify user is the client
  if (contract.client._id.toString() !== userId.toString()) {
    throw AppError('Only the client can verify contract payment', 403);
  }

  if (!contract.paymentTransactionId) {
    throw AppError('Contract does not have a payment transaction', 400);
  }

  // Verify payment using payment service
  const paymentService = (await import('../payments/payment.service.js')).default;
  const result = await paymentService.verifyDeposit(
    contract.paymentTransactionId,
    callbackData,
    paymentMethod
  );

  // Get updated contract
  const updatedContract = await contractService.getContractById(id, userId);

  successResponse(res, { 
    contract: updatedContract,
    payment: result 
  }, 'Payment verified successfully', 200);
});

/**
 * @desc    Start contract (pending → active)
 * @route   POST /api/contracts/:id/start
 * @access  Private (Client or Freelancer)
 */
export const startContract = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const contract = await contractService.startContract(id, userId);

  successResponse(res, { contract }, 'Contract started successfully', 200);
});

/**
 * @desc    Submit work for review (active → in_review)
 * @route   POST /api/contracts/:id/submit-work
 * @access  Private (Freelancer only)
 */
export const submitWork = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { deliverables } = req.body;

  if (!deliverables || deliverables.length === 0) {
    throw AppError('At least one deliverable is required', 400);
  }

  const contract = await contractService.submitWork(id, userId, deliverables);

  successResponse(res, { contract }, 'Work submitted successfully', 200);
});

/**
 * @desc    Approve work and release payment (in_review → completed)
 * @route   POST /api/contracts/:id/approve-work
 * @access  Private (Client only)
 */
export const approveWork = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { rating, comment } = req.body;

  // Validate rating if provided
  if (rating !== undefined && (rating < 1 || rating > 5)) {
    throw AppError('Rating must be between 1 and 5', 400);
  }

  const reviewData = (rating !== undefined && rating !== null) ? { rating, comment } : null;
  const contract = await contractService.approveWork(id, userId, reviewData);

  successResponse(res, { contract }, 'Work approved and payment released successfully', 200);
});

/**
 * @desc    Request revision (in_review → active)
 * @route   POST /api/contracts/:id/request-revision
 * @access  Private (Client only)
 */
export const requestRevision = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { feedback } = req.body;

  const contract = await contractService.requestRevision(id, userId, feedback);

  successResponse(res, { contract }, 'Revision requested successfully', 200);
});

/**
 * @desc    Close contract (completed → closed)
 * @route   POST /api/contracts/:id/close
 * @access  Private (Client only)
 */
export const closeContract = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const contract = await contractService.closeContract(id, userId);

  successResponse(res, { contract }, 'Contract closed successfully', 200);
});

/**
 * @desc    Start milestone (pending → in_progress)
 * @route   POST /api/contracts/:id/milestones/:milestoneId/start
 * @access  Private (Freelancer only)
 */
export const startMilestone = asyncHandler(async (req, res) => {
  const { id: contractId, milestoneId } = req.params;
  const userId = req.user.id;

  const contract = await contractService.startMilestone(contractId, milestoneId, userId);

  successResponse(res, { contract }, 'Milestone started successfully', 200);
});

/**
 * @desc    Submit milestone for review (in_progress → in_review)
 * @route   POST /api/contracts/:id/milestones/:milestoneId/submit
 * @access  Private (Freelancer only)
 */
export const submitMilestone = asyncHandler(async (req, res) => {
  const { id: contractId, milestoneId } = req.params;
  const userId = req.user.id;
  const { deliverables } = req.body;

  const contract = await contractService.submitMilestone(contractId, milestoneId, userId, deliverables);

  successResponse(res, { contract }, 'Milestone submitted for review', 200);
});

/**
 * @desc    Approve milestone work and release payment (in_review → completed)
 * @route   POST /api/contracts/:id/milestones/:milestoneId/approve
 * @access  Private (Client only)
 */
export const approveMilestoneWork = asyncHandler(async (req, res) => {
  const { id: contractId, milestoneId } = req.params;
  const userId = req.user.id;

  const contract = await contractService.approveMilestoneWork(contractId, milestoneId, userId);

  successResponse(res, { contract }, 'Milestone approved and payment released', 200);
});

/**
 * @desc    Request revision on a milestone (in_review → revision_requested)
 * @route   POST /api/contracts/:id/milestones/:milestoneId/request-revision
 * @access  Private (Client only)
 */
export const requestMilestoneRevision = asyncHandler(async (req, res) => {
  const { id: contractId, milestoneId } = req.params;
  const userId = req.user.id;
  const { feedback } = req.body;

  const contract = await contractService.requestMilestoneRevision(contractId, milestoneId, userId, feedback);

  successResponse(res, { contract }, 'Milestone revision requested', 200);
});