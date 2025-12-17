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
  console.log('🔵 [createFromProposal Controller] Started');
  console.log('🔵 Request Body:', JSON.stringify(req.body, null, 2));
  console.log('🔵 User:', req.user);
  
  if (!req.user) {
    throw AppError('Not authenticated', 401);
  }
  
  // Auth middleware sets req.user.id (not _id)
  const userId = req.user.id;
  console.log('🔵 User ID:', userId);
  
  if (!userId) {
    throw AppError('User ID not found in session', 401);
  }
  
  const { proposalId, terms, deadline, milestones } = req.body;
  
  console.log('🔵 Calling contractService.createFromProposal...');
  const contract = await contractService.createFromProposal(
    proposalId,
    userId,
    { terms, deadline, milestones }
  );
  console.log('🔵 Contract created successfully:', contract._id);

  successResponse(res, { contract }, 'Contract created successfully', 201);
});

/**
 * @desc    Get all contracts for logged-in user
 * @route   GET /api/contracts
 * @access  Private
 */
export const getMyContracts = asyncHandler(async (req, res) => {
  // [CONTRACTS][DEBUG] 1. REQUEST ENTRY LOG
  console.log('\n========================================');
  console.log('[CONTRACTS][DEBUG][REQUEST] GET /api/contracts called');
  console.log('[CONTRACTS][DEBUG][REQUEST] userId:', req.user?.id);
  console.log('[CONTRACTS][DEBUG][REQUEST] userRole:', req.user?.role);
  console.log('[CONTRACTS][DEBUG][REQUEST] rawQuery:', JSON.stringify(req.query));
  console.log('========================================\n');

  const { status, role, page, limit, sortBy, order } = req.query;
  
  // [CONTRACTS][DEBUG] Resolved filter values
  console.log('[CONTRACTS][DEBUG][FILTERS] status:', status || 'ALL');
  console.log('[CONTRACTS][DEBUG][FILTERS] role:', role || 'BOTH');
  console.log('[CONTRACTS][DEBUG][FILTERS] page:', page || 1);
  console.log('[CONTRACTS][DEBUG][FILTERS] limit:', limit || 10);
  
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

  // [CONTRACTS][DEBUG] 5. RESPONSE LOG
  console.log('\n========================================');
  console.log('[CONTRACTS][DEBUG][RESPONSE] Contracts count:', result.contracts?.length || 0);
  console.log('[CONTRACTS][DEBUG][RESPONSE] Contract IDs:', result.contracts?.map(c => c._id) || []);
  console.log('[CONTRACTS][DEBUG][RESPONSE] Statuses:', result.contracts?.map(c => c.status) || []);
  if (result.pagination) {
    console.log('[CONTRACTS][DEBUG][RESPONSE] Pagination:', JSON.stringify(result.pagination));
  }
  console.log('========================================\n');

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
  console.log('\\n[CONTRACT][CONTROLLER] GET /api/contracts/:id called');
  console.log('[CONTRACT][CONTROLLER] req.params.id:', req.params.id);
  console.log('[CONTRACT][CONTROLLER] req.user:', req.user);
  console.log('[CONTRACT][CONTROLLER] req.user.id:', req.user?.id);
  console.log('[CONTRACT][CONTROLLER] req.user.role:', req.user?.role);
  
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
