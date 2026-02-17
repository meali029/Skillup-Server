import Contract from '../../models/Contract.js';
import Proposal from '../../models/Proposal.js';
import Job from '../../models/Job.js';
import User from '../../models/User.js';
import Conversation from '../../models/Conversation.js';
import Escrow from '../../models/Escrow.js';
import { createAppError } from '../../core/errors/index.js';
import { createAuditLog } from '../../core/utils/auditLogger.js';
import { markJobInProgress, markJobCompleted } from '../jobs/job.service.js';
import {
  CONTRACT_STATUS,
  MILESTONE_STATUS,
  PAYMENT_TYPE,
  MILESTONE_EDITABLE_STATUSES,
  TERMINAL_STATUSES,
  isStatusTransitionAllowed,
  isMilestoneTransitionAllowed,
} from './contract.constants.js';
import escrowService from '../payments/escrow.service.js';
import paymentService from '../payments/payment.service.js';
import walletService from '../payments/wallet.service.js';
import paymentModeService from '../../services/paymentGateways/paymentMode.service.js';
import { notifyUser } from '../notifications/notification.service.js';
import { emitContractEvent } from '../../sockets/index.js';

class ContractService {
  /**
   * Create a contract from an accepted proposal
   * Business Rules Enforced:
   * 1. Proposal must exist and be accepted
   * 2. Proposal must belong to the specified job
   * 3. Only the job owner (client) can create the contract
   * 4. Client and freelancer must be different users
   * 5. Only one contract per proposal
   * 6. Payment must be initialized before contract is created
   */
  async createFromProposal(proposalId, clientId, contractData, paymentData = null) {
    try {
      // Business Rule: Validate authentication
      if (!clientId) {
        throw createAppError('Not authenticated', 401);
      }

      // Business Rule: Validate proposal exists and populate related data
      const proposal = await Proposal.findById(proposalId)
        .populate('jobId')
        .populate('freelancerId');

      if (!proposal) {
        throw createAppError('Proposal not found', 404);
      }

      // Business Rule: Validate related entities exist
      if (!proposal.jobId) {
        throw createAppError('Job associated with proposal not found', 404);
      }
      if (!proposal.freelancerId) {
        throw createAppError('Freelancer associated with proposal not found', 404);
      }

      // Business Rule: Only accepted proposals can be converted to contracts
      if (proposal.status !== 'accepted') {
        throw createAppError('Only accepted proposals can be converted to contracts', 400);
      }

      // Business Rule: Prevent duplicate contracts for same proposal
      const existingContract = await Contract.findOne({ proposal: proposalId });
      if (existingContract) {
        throw createAppError('Contract already exists for this proposal', 400);
      }

      // Business Rule: Only job owner (client) can create contract
      if (!proposal.jobId.client) {
        throw createAppError('Job client information is missing', 500);
      }

      // Safely compare IDs
      const jobClientStr = proposal.jobId.client.toString();
      const currentClientStr = clientId.toString();
      const freelancerStr = (proposal.freelancerId._id || proposal.freelancerId).toString();

      if (jobClientStr !== currentClientStr) {
        throw createAppError('Only the job client can create a contract', 403);
      }

      // Business Rule: Client and freelancer must be different users
      if (currentClientStr === freelancerStr) {
        throw createAppError('Client and freelancer must be different users', 400);
      }

      const jobId = proposal.jobId._id || proposal.jobId;
      const freelancerId = proposal.freelancerId._id || proposal.freelancerId;

      // Calculate total amount (use totalAmount or sum of milestones)
      const totalAmount = contractData.totalAmount || 
        (contractData.milestones && contractData.milestones.length > 0
          ? contractData.milestones.reduce((sum, m) => sum + (m.amount || 0), 0)
          : proposal.bidAmount);

      // Validate payment data is provided
      if (!paymentData || !paymentData.paymentMethod) {
        throw createAppError('Payment method is required to create contract', 400);
      }

      // Create escrow for total contract amount BEFORE creating contract
      const escrow = await escrowService.createEscrow(
        null, // contractId not yet created
        'TOTAL', // special milestoneId for total contract escrow
        totalAmount,
        {
          clientId: jobClientStr,
          freelancerId: freelancerId,
        }
      );

      let paymentResult;
      let isWalletPayment = paymentData.paymentMethod === 'WALLET';

      if (isWalletPayment) {
        // WALLET PAYMENT: Deduct from wallet and fund escrow directly
        // Check wallet balance
        const wallet = await walletService.getWallet(clientId);
        if (!wallet || wallet.availableBalance < totalAmount) {
          // Delete the escrow we just created since payment failed
          await Escrow.findByIdAndDelete(escrow._id);
          throw createAppError(
            `Insufficient wallet balance. Available: Rs. ${wallet?.availableBalance || 0}, Required: Rs. ${totalAmount}`,
            400
          );
        }

        // Lock funds from wallet for escrow
        const lockResult = await walletService.lockFunds(
          clientId,
          totalAmount,
          escrow._id.toString()
        );

        // Fund escrow with wallet transaction
        await escrow.fund(lockResult.transaction?._id?.toString() || `WALLET-${Date.now()}`, 'WALLET');
        await escrow.save();

        paymentResult = {
          transactionId: lockResult.transaction?._id?.toString() || `WALLET-${Date.now()}`,
          paymentUrl: null,
          requiresManualVerification: false,
          isWalletPayment: true,
        };
      } else {
        // EXTERNAL PAYMENT: Initialize deposit with escrow linking
        paymentResult = await paymentService.initializeDeposit(
          clientId,
          totalAmount,
          paymentData.paymentMethod,
          paymentData.customerData || {},
          {
            escrowId: escrow._id.toString(),
            contractId: null, // Will be set after contract creation
            isContractCreation: true,
          }
        );
        paymentResult.isWalletPayment = false;
      }

      // Create contract with escrow reference
      const contract = new Contract({
        job: jobId,
        proposal: proposal._id,
        client: jobClientStr,
        freelancer: freelancerId,
        title: proposal.jobId.title || 'Untitled Contract',
        description: proposal.coverLetter || proposal.jobId.description || 'No description provided',
        totalAmount: totalAmount,
        paymentType: proposal.paymentType || PAYMENT_TYPE.FIXED,
        hourlyRate: proposal.hourlyRate,
        estimatedHours: proposal.estimatedHours,
        terms: contractData.terms,
        deadline: contractData.deadline,
        milestones: contractData.milestones || [],
        // If wallet payment, contract is ACTIVE immediately since funds are already locked
        status: isWalletPayment ? CONTRACT_STATUS.ACTIVE : CONTRACT_STATUS.PENDING,
        paymentStatus: isWalletPayment ? 'FUNDED' : 'PENDING',
        initialEscrowId: escrow._id,
        paymentTransactionId: paymentResult.transactionId,
      });

      await contract.save();

      // Link escrow to contract after creation
      escrow.contractId = contract._id;
      await escrow.save();

      // Auto-fund escrows for milestones defined during contract creation
      if (isWalletPayment && contract.milestones.length > 0) {
        for (const milestone of contract.milestones) {
          try {
            const milestoneEscrow = await escrowService.createEscrow(
              contract._id.toString(),
              milestone._id.toString(),
              milestone.amount
            );
            // Direct DB update to bypass model validations
            await Escrow.findByIdAndUpdate(milestoneEscrow._id, {
              status: 'LOCKED',
              fundedAt: new Date(),
              lockedAt: new Date(),
              paymentMethod: 'CONTRACT_ESCROW',
              fundTransactionId: paymentResult.transactionId || null,
              expiresAt: null,
            });

            milestone.escrowId = milestoneEscrow._id;
          } catch (err) {
            console.error('Failed to auto-fund milestone escrow:', milestone._id, err.message);
          }
        }
        await contract.save();
      }

      // Create conversation for contract communication
      await Conversation.findOrCreate(
        [contract.client, contract.freelancer],
        {
          job: contract.job,
          contract: contract._id,
          type: 'contract',
          metadata: {
            jobTitle: proposal.jobId.title || 'Contract',
            contractStatus: CONTRACT_STATUS.PENDING,
          },
        }
      );

      // Populate and return
      const populatedContract = await contract.populate([
        { path: 'client', select: 'name email avatar' },
        { path: 'freelancer', select: 'name email avatar' },
        { path: 'job', select: 'title description' },
      ]);

      // Return contract with payment information
      return {
        contract: populatedContract,
        paymentUrl: paymentResult.paymentUrl,
        transactionId: paymentResult.transactionId,
        requiresManualVerification: paymentResult.requiresManualVerification || false,
        bankAccount: paymentResult.bankAccount,
        referenceNumber: paymentResult.referenceNumber,
        escrowId: escrow._id.toString(),
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get contract by ID
   * Business Rule: Only client or freelancer can view the contract
   */
  async getContractById(contractId, userId) {
    const contract = await Contract.findById(contractId)
      .populate('client', 'name email avatar role')
      .populate('freelancer', 'name email avatar role')
      .populate('job', 'title description budget')
      .populate('proposal');

    if (!contract) {
      throw createAppError('Contract not found', 404);
    }

    // Extract IDs safely
    const clientId = (contract.client?._id || contract.client)?.toString();
    const freelancerId = (contract.freelancer?._id || contract.freelancer)?.toString();
    const userIdStr = userId?.toString();

    // Business Rule: Authorization - only parties involved can VIEW (read access)
    // Use canBeViewedBy for read operations, not canBeModifiedBy
    if (!contract.canBeViewedBy(userId)) {
      throw createAppError('You do not have access to this contract', 403);
    }

    return contract;
  }

  /**
   * Get contracts for a user
   * Returns only contracts where user is either client or freelancer
   */
  async getContractsByUser(userId, filters = {}, userRole = null) {
    // Build query to show all contracts where user is either client or freelancer
    let query = {
      $or: [{ client: userId }, { freelancer: userId }],
    };

    // Apply optional status filter
    if (filters.status) {
      query.status = filters.status;
    }
    
    // Apply optional role filter to narrow down results
    if (filters.role === 'client') {
      query = { client: userId };
      if (filters.status) query.status = filters.status;
    } else if (filters.role === 'freelancer') {
      query = { freelancer: userId };
      if (filters.status) query.status = filters.status;
    }

    const page = parseInt(filters.page) || 1;
    const limit = parseInt(filters.limit) || 10;
    const skip = (page - 1) * limit;
    const sortBy = filters.sortBy || 'createdAt';
    const order = filters.order === 'asc' ? 1 : -1;

    const [contracts, total] = await Promise.all([
      Contract.find(query)
        .populate('client', 'name email avatar')
        .populate('freelancer', 'name email avatar')
        .populate('job', 'title budget')
        .sort({ [sortBy]: order })
        .skip(skip)
        .limit(limit),
      Contract.countDocuments(query),
    ]);

    // [CONTRACTS][DEBUG] 3. DATABASE RESULT LOG
    return {
      contracts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Accept or decline a contract
   * Business Rules:
   * 1. Only freelancer can respond to contract
   * 2. Contract must be in pending status
   * 3. Accept transitions to active, decline transitions to cancelled
   */
  async respondToContract(contractId, userId, action, reason) {
    // Validate required parameters
    if (!contractId) {
      throw createAppError('Contract ID is required', 400);
    }
    if (!userId) {
      throw createAppError('User ID is required', 400);
    }
    
    const contract = await Contract.findById(contractId);

    if (!contract) {
      throw createAppError('Contract not found', 404);
    }
    
    // Validate contract has required fields
    if (!contract.freelancer) {
      throw createAppError('Contract freelancer data is missing', 500);
    }

    // Business Rule: Contract must be in pending status
    if (contract.status !== CONTRACT_STATUS.PENDING) {
      throw createAppError('Contract is not in pending status', 400);
    }

    // Business Rule: Authorization - only freelancer can respond
    if (!contract.isFreelancer(userId)) {
      throw createAppError('Only the freelancer can respond to the contract', 403);
    }

    // Handle accept/decline actions with proper status transitions
    if (action === 'accept') {
      // Business Rule: Payment must be completed before freelancer can accept
      // Accept both COMPLETED (external payment) and FUNDED (wallet payment) statuses
      if (contract.paymentStatus && !['COMPLETED', 'FUNDED'].includes(contract.paymentStatus)) {
        throw createAppError('Contract payment must be completed before acceptance', 400);
      }
      
      const newStatus = CONTRACT_STATUS.ACTIVE;
      
      // Validate status transition
      if (!contract.canTransitionTo(newStatus)) {
        throw createAppError('Invalid status transition', 400);
      }
      
      contract.status = newStatus;
      // startDate is auto-set by pre-save hook when status becomes active
      
      // Update job status to in-progress when contract is accepted
      try {
        await markJobInProgress(contract.job);
      } catch (error) {
        // Log but don't fail contract acceptance if job update fails
        console.error('Failed to update job status to in-progress:', error.message);
      }
    } else if (action === 'decline') {
      const newStatus = CONTRACT_STATUS.CANCELLED;
      
      // Validate status transition
      if (!contract.canTransitionTo(newStatus)) {
        throw createAppError('Invalid status transition', 400);
      }
      
      contract.status = newStatus;
      contract.cancelledAt = new Date();
      contract.cancelledBy = userId;
      contract.cancellationReason = reason || 'Declined by freelancer';
    } else {
      throw createAppError('Invalid action. Must be "accept" or "decline"', 400);
    }

    await contract.save();

    // Auto-fund milestone escrows when contract becomes active
    if (action === 'accept' && contract.milestones.length > 0) {
      for (const milestone of contract.milestones) {
        try {
          let milestoneEscrow = await escrowService.getEscrowByMilestone(contractId, milestone._id.toString());
          if (!milestoneEscrow) {
            milestoneEscrow = await escrowService.createEscrow(
              contractId,
              milestone._id.toString(),
              milestone.amount
            );
          }
          if (milestoneEscrow.status === 'CREATED') {
            await Escrow.findByIdAndUpdate(milestoneEscrow._id, {
              status: 'LOCKED',
              fundedAt: new Date(),
              lockedAt: new Date(),
              paymentMethod: 'CONTRACT_ESCROW',
              fundTransactionId: contract.paymentTransactionId || null,
              expiresAt: null,
            });

            milestone.escrowId = milestoneEscrow._id;
          }
        } catch (err) {
          console.error('[CONTRACT][ACCEPT] Failed to auto-fund milestone escrow:', milestone._id, err.message);
        }
      }
      await contract.save();
    }

    // Update conversation metadata to reflect contract status
    await Conversation.findOneAndUpdate(
      { contract: contract._id },
      { 'metadata.contractStatus': contract.status }
    );

    return contract.populate([
      { path: 'client', select: 'name email avatar' },
      { path: 'freelancer', select: 'name email avatar' },
      { path: 'job', select: 'title' },
    ]);
  }

  /**
   * Add milestone to contract
   * Business Rules:
   * 1. Only client can add milestones
   * 2. Milestones can only be added to pending or active contracts
   * 3. Milestone dueDate must be valid against contract dates
   */
  async addMilestone(contractId, userId, milestoneData) {
    const contract = await Contract.findById(contractId);

    if (!contract) {
      throw createAppError('Contract not found', 404);
    }

    // Business Rule: Authorization - only contract parties can modify
    if (!contract.canBeModifiedBy(userId)) {
      throw createAppError('You do not have access to this contract', 403);
    }

    // Business Rule: Authorization - only client can add milestones
    if (!contract.isClient(userId)) {
      throw createAppError('Only the client can add milestones', 403);
    }

    // Business Rule: Milestones can only be added to pending or active contracts
    if (!contract.canAddMilestone()) {
      throw createAppError(
        `Cannot add milestone. Contract must be in ${MILESTONE_EDITABLE_STATUSES.join(' or ')} status`,
        400
      );
    }

    // Business Rule: Validate milestone dueDate against contract dates
    if (milestoneData.dueDate) {
      const dueDate = new Date(milestoneData.dueDate);
      
      // Ensure dueDate is not in the past
      if (dueDate < new Date()) {
        throw createAppError('Milestone due date cannot be in the past', 400);
      }
      
      // If contract has a deadline, milestone due date should not exceed it
      if (contract.deadline && dueDate > new Date(contract.deadline)) {
        throw createAppError('Milestone due date cannot exceed contract deadline', 400);
      }
    }

    // Add milestone with default status
    const newMilestone = {
      ...milestoneData,
      status: MILESTONE_STATUS.PENDING,
    };
    contract.milestones.push(newMilestone);
    
    await contract.save();

    // Create escrow for the milestone
    const addedMilestone = contract.milestones[contract.milestones.length - 1];
    try {
      const milestoneEscrow = await escrowService.createEscrow(
        contractId,
        addedMilestone._id.toString(),
        milestoneData.amount
      );

      // Auto-fund milestone escrow if contract is already funded/active
      // The total contract payment already covers all milestones
      if (contract.status === CONTRACT_STATUS.ACTIVE) {
        try {
          await Escrow.findByIdAndUpdate(milestoneEscrow._id, {
            status: 'LOCKED',
            fundedAt: new Date(),
            lockedAt: new Date(),
            paymentMethod: 'CONTRACT_ESCROW',
            fundTransactionId: contract.paymentTransactionId || null,
            expiresAt: null,
          });

          // Store escrow ID on milestone
          addedMilestone.escrowId = milestoneEscrow._id;
          await contract.save();
        } catch (fundError) {
          console.error('[CONTRACT][ADD_MILESTONE] Auto-fund failed (milestone still created):', fundError.message);
        }
      }
    } catch (error) {
      // Log error but don't fail milestone creation
      console.error('Failed to create escrow for milestone:', error.message);
    }

    return contract;
  }

  /**
   * Update milestone (metadata only - NOT status)
   * Business Rules:
   * 1. Cannot update milestones in terminal contract states
   * 2. Only client can update milestone metadata
   * 3. Status changes must go through dedicated workflow methods
   */
  async updateMilestone(contractId, milestoneId, userId, updateData) {
    const contract = await Contract.findById(contractId);

    if (!contract) {
      throw createAppError('Contract not found', 404);
    }

    // Business Rule: Authorization - only contract parties can modify
    if (!contract.canBeModifiedBy(userId)) {
      throw createAppError('You do not have access to this contract', 403);
    }

    // Business Rule: Only client can update milestone metadata
    if (!contract.isClient(userId)) {
      throw createAppError('Only the client can update milestone details', 403);
    }

    // Business Rule: Cannot modify milestones in terminal states
    if (TERMINAL_STATUSES.includes(contract.status)) {
      throw createAppError(
        `Cannot update milestone. Contract is in ${contract.status} status`,
        400
      );
    }

    const milestone = contract.milestones.id(milestoneId);
    if (!milestone) {
      throw createAppError('Milestone not found', 404);
    }

    // Business Rule: Cannot update milestones that are past pending (already started)
    if (milestone.status !== MILESTONE_STATUS.PENDING) {
      throw createAppError('Can only edit milestones that have not been started yet', 400);
    }

    // Block status changes via this endpoint
    if (updateData.status) {
      throw createAppError('Cannot change milestone status via update. Use dedicated workflow endpoints (start, submit, approve, request-revision).', 400);
    }

    // Business Rule: Validate dueDate if being updated
    if (updateData.dueDate) {
      const newDueDate = new Date(updateData.dueDate);
      
      if (newDueDate < new Date()) {
        throw createAppError('Milestone due date cannot be in the past', 400);
      }
      
      if (contract.deadline && newDueDate > new Date(contract.deadline)) {
        throw createAppError('Milestone due date cannot exceed contract deadline', 400);
      }
    }

    // Only allow safe fields to be updated
    const allowedFields = ['title', 'description', 'amount', 'dueDate', 'notes'];
    allowedFields.forEach((key) => {
      if (updateData[key] !== undefined) {
        milestone[key] = updateData[key];
      }
    });

    await contract.save();

    return contract;
  }

  /**
   * Start milestone (pending → in_progress)
   * Only freelancer can start a milestone
   * Enforces sequential order: only the next pending milestone can be started
   */
  async startMilestone(contractId, milestoneId, freelancerId) {
    const contract = await Contract.findById(contractId);
    if (!contract) {
      throw createAppError('Contract not found', 404);
    }

    if (!contract.isFreelancer(freelancerId)) {
      throw createAppError('Only the freelancer can start milestones', 403);
    }

    if (contract.status !== CONTRACT_STATUS.ACTIVE) {
      throw createAppError(`Contract must be active to start milestones. Current status: ${contract.status}`, 400);
    }

    const milestone = contract.milestones.id(milestoneId);
    if (!milestone) {
      throw createAppError('Milestone not found', 404);
    }

    // Allow transition from pending or revision_requested
    if (milestone.status !== MILESTONE_STATUS.PENDING && milestone.status !== MILESTONE_STATUS.REVISION_REQUESTED) {
      throw createAppError(`Cannot start milestone in ${milestone.status} status`, 400);
    }

    // Verify escrow is funded before freelancer can start
    let escrow = await escrowService.getEscrowByMilestone(contractId, milestoneId);
    
    // Auto-fund milestone escrow if contract's total escrow is already funded
    // This handles milestones where the client already paid for the full contract
    if (!escrow || !['FUNDED', 'LOCKED'].includes(escrow.status)) {
      // Check if contract is active (meaning client already paid)
      if (contract.status === CONTRACT_STATUS.ACTIVE) {
        try {
          // Create escrow if it doesn't exist
          if (!escrow) {
            try {
              escrow = await escrowService.createEscrow(contractId, milestoneId, milestone.amount);
            } catch (createErr) {
              // If "already exists" error, try to fetch it again
              escrow = await Escrow.findOne({ contractId, milestoneId });
              if (!escrow) {
                throw createErr;
              }
            }
          }
          
          // Auto-fund: directly update escrow status in DB to bypass wallet transfer
          // Since client already paid the total contract amount, no additional deduction needed
          if (escrow.status === 'CREATED' || escrow.status === 'EXPIRED') {
            await Escrow.findByIdAndUpdate(escrow._id, {
              status: 'LOCKED',
              fundedAt: new Date(),
              lockedAt: new Date(),
              paymentMethod: 'CONTRACT_ESCROW',
              fundTransactionId: contract.paymentTransactionId || null,
              expiresAt: null,
            });
            
            // Refresh escrow object
            escrow = await Escrow.findById(escrow._id);
            
            // Store escrow ID on milestone
            milestone.escrowId = escrow._id;
            await contract.save();
          }
        } catch (autoFundError) {
          console.error('[START_MILESTONE] Auto-fund failed:', autoFundError.message, autoFundError.stack);
          throw createAppError(
            'This milestone has not been funded yet. The client must fund the escrow before you can start working.',
            400
          );
        }
      } else {
        throw createAppError(
          'This milestone has not been funded yet. The client must fund the escrow before you can start working.',
          400
        );
      }
    }

    // Sequential enforcement: no other milestone should be in_progress or in_review
    const activeOrReviewMilestone = contract.milestones.find(
      (m) => m._id.toString() !== milestoneId && 
        (m.status === MILESTONE_STATUS.IN_PROGRESS || m.status === MILESTONE_STATUS.IN_REVIEW)
    );
    if (activeOrReviewMilestone) {
      throw createAppError('Another milestone is currently in progress or under review. Complete it first.', 400);
    }

    milestone.status = MILESTONE_STATUS.IN_PROGRESS;
    await contract.save();

    return contract;
  }

  /**
   * Submit milestone for review (in_progress → in_review)
   * Only freelancer can submit a milestone
   * Deliverables are attached to the milestone
   */
  async submitMilestone(contractId, milestoneId, freelancerId, deliverables = []) {
    const contract = await Contract.findById(contractId);
    if (!contract) {
      throw createAppError('Contract not found', 404);
    }

    if (!contract.isFreelancer(freelancerId)) {
      throw createAppError('Only the freelancer can submit milestone work', 403);
    }

    if (contract.status !== CONTRACT_STATUS.ACTIVE) {
      throw createAppError('Contract must be active to submit milestones', 400);
    }

    const milestone = contract.milestones.id(milestoneId);
    if (!milestone) {
      throw createAppError('Milestone not found', 404);
    }

    if (milestone.status !== MILESTONE_STATUS.IN_PROGRESS && milestone.status !== MILESTONE_STATUS.REVISION_REQUESTED) {
      throw createAppError(`Cannot submit milestone in ${milestone.status} status. Must be in progress or revision_requested.`, 400);
    }

    // Add deliverables to milestone
    if (deliverables && deliverables.length > 0) {
      const newDeliverables = deliverables.map(d => ({
        title: d.title,
        description: d.description || '',
        fileUrl: d.fileUrl || '',
        fileName: d.fileName || '',
        fileType: d.fileType || '',
        fileSize: d.fileSize || 0,
        submittedAt: new Date(),
      }));
      milestone.deliverables = newDeliverables;
    }

    milestone.status = MILESTONE_STATUS.IN_REVIEW;
    milestone.submittedAt = new Date();
    milestone.revisionNote = undefined; // Clear any previous revision note
    await contract.save();

    // Populate and notify
    await contract.populate([{ path: 'client' }, { path: 'freelancer' }]);

    try {
      await notifyUser(contract.client._id || contract.client, {
        type: 'MILESTONE_SUBMITTED',
        title: 'Milestone Submitted for Review',
        message: `${contract.freelancer.name} has submitted "${milestone.title}" for review on "${contract.title}".`,
        link: `/contracts/${contractId}`,
        data: { contractId, milestoneId, milestoneTitle: milestone.title },
      });

      emitContractEvent(contractId, 'milestone_submitted', {
        clientId: contract.client._id || contract.client,
        freelancerId,
        milestoneId,
        milestoneTitle: milestone.title,
      });
    } catch (error) {
      console.error('Failed to send milestone submission notification:', error);
    }

    return contract;
  }

  /**
   * Approve milestone work and release payment (in_review → completed)
   * Only client can approve
   * Releases the per-milestone escrow
   * Auto-completes contract if all milestones are done
   */
  async approveMilestoneWork(contractId, milestoneId, clientId) {
    const contract = await Contract.findById(contractId);
    if (!contract) {
      throw createAppError('Contract not found', 404);
    }

    if (!contract.isClient(clientId)) {
      throw createAppError('Only the client can approve milestone work', 403);
    }

    const milestone = contract.milestones.id(milestoneId);
    if (!milestone) {
      throw createAppError('Milestone not found', 404);
    }

    if (milestone.status !== MILESTONE_STATUS.IN_REVIEW) {
      throw createAppError(`Cannot approve milestone in ${milestone.status} status. Must be in review.`, 400);
    }

    // Release per-milestone escrow
    let paymentDetails = null;
    try {
      const escrow = await escrowService.getEscrowByMilestone(contractId, milestoneId);
      if (escrow && ['FUNDED', 'LOCKED'].includes(escrow.status)) {
        const result = await escrowService.releaseEscrow(escrow._id.toString(), clientId);
        paymentDetails = result.paymentDetails;
      } else if (escrow && escrow.status === 'RELEASED') {
        paymentDetails = {
          grossAmount: milestone.amount,
          platformFee: milestone.amount * 0.05,
          netAmount: milestone.amount * 0.95,
          feePercentage: 5,
        };
      } else {
        throw createAppError(
          `Cannot approve milestone without funded escrow. Milestone must be funded before approval. Current escrow status: ${escrow?.status || 'NOT_CREATED'}`,
          400
        );
      }
    } catch (error) {
      // If it's already an AppError, re-throw it
      if (error.statusCode) {
        throw error;
      }
      console.error('[CONTRACT][APPROVE_MILESTONE] Escrow release failed:', error.message);
      throw createAppError('Failed to release escrow payment. Please contact support.', 500);
    }

    // Update milestone status
    milestone.status = MILESTONE_STATUS.COMPLETED;
    milestone.completedAt = new Date();
    milestone.approvedAt = new Date();

    await contract.save();

    // Populate for notification
    await contract.populate([{ path: 'client' }, { path: 'freelancer' }]);

    // Notify freelancer
    try {
      const paymentMessage = paymentDetails
        ? `Payment of PKR ${paymentDetails.netAmount?.toLocaleString()} released for milestone "${milestone.title}".`
        : `Milestone "${milestone.title}" approved!`;

      await notifyUser(contract.freelancer._id || contract.freelancer, {
        type: 'MILESTONE_APPROVED',
        title: 'Milestone Approved!',
        message: `${contract.client.name} approved "${milestone.title}" on "${contract.title}". ${paymentMessage}`,
        link: `/contracts/${contractId}`,
        data: { contractId, milestoneId, milestoneTitle: milestone.title, paymentDetails },
      });

      emitContractEvent(contractId, 'milestone_approved', {
        clientId,
        freelancerId: contract.freelancer._id || contract.freelancer,
        milestoneId,
        milestoneTitle: milestone.title,
        paymentDetails,
      });
    } catch (error) {
      console.error('Failed to send milestone approval notification:', error);
    }

    await createAuditLog({
      adminId: clientId,
      action: 'MILESTONE_APPROVED',
      targetType: 'Contract',
      targetId: contractId,
      details: { milestoneId, milestoneTitle: milestone.title, paymentDetails },
    });

    // Check if ALL milestones are now completed → auto-complete contract
    const allCompleted = contract.milestones.every(m => m.status === MILESTONE_STATUS.COMPLETED);
    if (allCompleted && contract.milestones.length > 0) {
      
      contract.status = CONTRACT_STATUS.COMPLETED;
      contract.completedAt = new Date();
      contract.reviewedAt = new Date();
      contract.reviewedBy = clientId;
      await contract.save();

      // Update job status
      try {
        await markJobCompleted(contract.job);
      } catch (error) {
        console.error('Failed to update job status to completed:', error.message);
      }

      // Update user statistics
      try {
        const totalContractAmount = contract.milestones.reduce((sum, m) => sum + (m.amount || 0), 0);
        
        await User.findByIdAndUpdate(clientId, {
          $inc: { completedJobsCount: 1, totalSpent: totalContractAmount }
        });

        const freelancerId = contract.freelancer._id || contract.freelancer;
        const freelancerEarnings = totalContractAmount * 0.95;
        await User.findByIdAndUpdate(freelancerId, {
          $inc: { completedJobsCount: 1, totalEarnings: freelancerEarnings }
        });
      } catch (statsError) {
        console.error('[CONTRACT][APPROVE_MILESTONE] Failed to update user stats:', statsError.message);
      }

      // Notify both parties about contract completion
      try {
        await notifyUser(contract.freelancer._id || contract.freelancer, {
          type: 'CONTRACT_COMPLETED',
          title: 'Contract Completed!',
          message: `All milestones on "${contract.title}" are complete. The contract has been auto-completed.`,
          link: `/contracts/${contractId}`,
          data: { contractId },
        });
      } catch (error) {
        console.error('Failed to send contract completion notification:', error);
      }
    }

    return contract;
  }

  /**
   * Request revision on a milestone (in_review → revision_requested)
   * Only client can request revisions
   */
  async requestMilestoneRevision(contractId, milestoneId, clientId, feedback) {
    const contract = await Contract.findById(contractId);
    if (!contract) {
      throw createAppError('Contract not found', 404);
    }

    if (!contract.isClient(clientId)) {
      throw createAppError('Only the client can request milestone revisions', 403);
    }

    const milestone = contract.milestones.id(milestoneId);
    if (!milestone) {
      throw createAppError('Milestone not found', 404);
    }

    if (milestone.status !== MILESTONE_STATUS.IN_REVIEW) {
      throw createAppError(`Cannot request revision for milestone in ${milestone.status} status`, 400);
    }

    if (!feedback || feedback.trim().length < 10) {
      throw createAppError('Revision feedback must be at least 10 characters', 400);
    }

    milestone.status = MILESTONE_STATUS.REVISION_REQUESTED;
    milestone.revisionNote = feedback.trim();
    milestone.deliverables = []; // Clear deliverables for resubmission
    await contract.save();

    // Populate and notify
    await contract.populate([{ path: 'client' }, { path: 'freelancer' }]);

    try {
      await notifyUser(contract.freelancer._id || contract.freelancer, {
        type: 'MILESTONE_REVISION_REQUESTED',
        title: 'Revision Requested',
        message: `${contract.client.name} has requested revisions on "${milestone.title}". Feedback: "${feedback.trim().substring(0, 100)}..."`,
        link: `/contracts/${contractId}`,
        data: { contractId, milestoneId, milestoneTitle: milestone.title, feedback: feedback.trim() },
      });

      emitContractEvent(contractId, 'milestone_revision_requested', {
        clientId,
        freelancerId: contract.freelancer._id || contract.freelancer,
        milestoneId,
        milestoneTitle: milestone.title,
        feedback: feedback.trim(),
      });
    } catch (error) {
      console.error('Failed to send milestone revision notification:', error);
    }

    return contract;
  }

  /**
   * Complete contract
   * Business Rules:
   * 1. Only client can complete contract
   * 2. Contract must be in active status
   * 3. Validates status transition
   * 4. Sets endDate and completedAt (also auto-set by pre-save hook)
   */
  async completeContract(contractId, userId) {
    const contract = await Contract.findById(contractId);

    if (!contract) {
      throw createAppError('Contract not found', 404);
    }

    // Business Rule: Authorization - only contract parties can access
    if (!contract.canBeModifiedBy(userId)) {
      throw createAppError('You do not have access to this contract', 403);
    }

    // Business Rule: Authorization - only client can complete contract
    if (!contract.isClient(userId)) {
      throw createAppError('Only the client can complete the contract', 403);
    }

    // Business Rule: Contract must be active to complete
    if (contract.status !== CONTRACT_STATUS.ACTIVE) {
      throw createAppError('Only active contracts can be completed', 400);
    }

    const newStatus = CONTRACT_STATUS.COMPLETED;
    
    // Business Rule: Validate status transition
    if (!contract.canTransitionTo(newStatus)) {
      throw createAppError('Invalid status transition', 400);
    }

    contract.status = newStatus;
    // completedAt is auto-set by pre-save hook
    contract.endDate = new Date();

    await contract.save();

    // Update job status to completed when contract is completed
    try {
      await markJobCompleted(contract.job);
    } catch (error) {
      // Log but don't fail contract completion if job update fails
      console.error('Failed to update job status to completed:', error.message);
    }

    // Update conversation metadata
    await Conversation.findOneAndUpdate(
      { contract: contract._id },
      { 'metadata.contractStatus': CONTRACT_STATUS.COMPLETED }
    );

    return contract;
  }

  /**
   * Cancel contract
   * Business Rules:
   * 1. Only client can cancel contract (not declined by freelancer which uses respondToContract)
   * 2. Contract must be pending or active
   * 3. Cancellation reason is required
   * 4. Validates status transition
   */
  async cancelContract(contractId, userId, reason) {
    const contract = await Contract.findById(contractId);

    if (!contract) {
      throw createAppError('Contract not found', 404);
    }

    // Business Rule: Authorization - only contract parties can access
    if (!contract.canBeModifiedBy(userId)) {
      throw createAppError('You do not have access to this contract', 403);
    }

    // Business Rule: Authorization - only client can cancel (freelancer declines via respondToContract)
    if (!contract.isClient(userId)) {
      throw createAppError('Only the client can cancel the contract', 403);
    }

    // Business Rule: Cancellation reason is required
    if (!reason || reason.trim().length === 0) {
      throw createAppError('Cancellation reason is required', 400);
    }

    const newStatus = CONTRACT_STATUS.CANCELLED;
    
    // Business Rule: Validate status transition
    if (!contract.canTransitionTo(newStatus)) {
      throw createAppError(
        `Cannot cancel contract in ${contract.status} status`,
        400
      );
    }

    contract.status = newStatus;
    contract.cancelledAt = new Date();
    contract.cancelledBy = userId;
    contract.cancellationReason = reason;

    await contract.save();

    // Update conversation metadata
    await Conversation.findOneAndUpdate(
      { contract: contract._id },
      { 'metadata.contractStatus': CONTRACT_STATUS.CANCELLED }
    );

    return contract;
  }

  /**
   * Get contract statistics for a user
   * Returns counts by status and financial totals
   */
  async getContractStats(userId) {
    const contracts = await Contract.find({
      $or: [{ client: userId }, { freelancer: userId }],
    });

    const stats = {
      total: contracts.length,
      active: contracts.filter((c) => c.status === CONTRACT_STATUS.ACTIVE).length,
      completed: contracts.filter((c) => c.status === CONTRACT_STATUS.COMPLETED).length,
      pending: contracts.filter((c) => c.status === CONTRACT_STATUS.PENDING).length,
      cancelled: contracts.filter((c) => c.status === CONTRACT_STATUS.CANCELLED).length,
      disputed: contracts.filter((c) => c.status === CONTRACT_STATUS.DISPUTED).length,
      terminated: contracts.filter((c) => c.status === CONTRACT_STATUS.TERMINATED).length,
      totalEarned: 0,
      totalSpent: 0,
    };

    contracts.forEach((contract) => {
      if (contract.status === CONTRACT_STATUS.COMPLETED) {
        if (contract.freelancer.toString() === userId.toString()) {
          stats.totalEarned += contract.totalAmount;
        }
        if (contract.client.toString() === userId.toString()) {
          stats.totalSpent += contract.totalAmount;
        }
      }
    });

    return stats;
  }

  /**
   * Fund milestone escrow
   * Business Rules:
   * 1. Only client can fund escrow
   * 2. Contract must be active or pending
   * 3. Milestone must exist
   * 4. Escrow must be in CREATED status
   */
  async fundMilestoneEscrow(contractId, milestoneId, userId, paymentData) {
    const contract = await Contract.findById(contractId);
    if (!contract) {
      throw createAppError('Contract not found', 404);
    }

    // Verify user is client
    if (!contract.isClient(userId)) {
      throw createAppError('Only the client can fund milestone escrow', 403);
    }

    // Verify contract status
    if (!contract.canAddMilestone()) {
      throw createAppError('Cannot fund escrow for contract in this status', 400);
    }

    // Verify milestone exists
    const milestone = contract.milestones.id(milestoneId);
    if (!milestone) {
      throw createAppError('Milestone not found', 404);
    }

    // Get or create escrow
    let escrow = await escrowService.getEscrowByMilestone(contractId, milestoneId);
    if (!escrow) {
      // Create escrow if it doesn't exist
      escrow = await escrowService.createEscrow(contractId, milestoneId, milestone.amount);
      
      // Store escrow ID on milestone
      milestone.escrowId = escrow._id;
      await contract.save();
    }

    // Check if payment method is WALLET
    if (paymentData.paymentMethod === 'WALLET') {
      // In test mode, auto-credit wallet if insufficient balance
      const isTestMode = await paymentModeService.isTestingMode();
      const wallet = await walletService.getWallet(userId);
      
      if (wallet.availableBalance < milestone.amount) {
        if (isTestMode) {
          // Auto-credit test funds
          const topUpAmount = milestone.amount - wallet.availableBalance;
          await walletService.creditWallet(userId, topUpAmount, {
            description: `[TEST MODE] Auto-funded PKR ${topUpAmount} for milestone escrow`,
            type: 'DEPOSIT',
          });
        } else {
          throw createAppError(
            `Insufficient wallet balance. Available: PKR ${wallet.availableBalance}, Required: PKR ${milestone.amount}`,
            400
          );
        }
      }

      // Fund escrow directly from wallet (locks funds)
      await escrowService.fundEscrow(escrow._id.toString(), {
        paymentMethod: 'WALLET',
      });

      // Return success without payment URL
      return {
        escrowId: escrow._id.toString(),
        paymentMethod: 'WALLET',
        success: true,
        message: `Milestone funded successfully from wallet. PKR ${milestone.amount} locked in escrow.`,
      };
    }

    // For external payment methods (JazzCash, EasyPaisa, Bank Transfer)
    // Initialize payment with escrow and contract linking
    const paymentResult = await paymentService.initializeDeposit(
      userId,
      milestone.amount,
      paymentData.paymentMethod,
      paymentData.customerData,
      {
        escrowId: escrow._id.toString(),
        contractId: contractId,
      }
    );

    // Fund escrow after payment is verified (this will be called from payment callback)
    // For now, return payment URL
    return {
      escrowId: escrow._id.toString(),
      paymentUrl: paymentResult.paymentUrl,
      transactionId: paymentResult.transactionId,
      requiresManualVerification: paymentResult.requiresManualVerification,
      bankAccount: paymentResult.bankAccount,
      referenceNumber: paymentResult.referenceNumber,
    };
  }

  /**
   * Approve milestone and release escrow (legacy - delegates to approveMilestoneWork)
   * Business Rules:
   * 1. Only client can approve milestone
   * 2. Milestone must be in_review
   * 3. Escrow must be funded/locked
   */
  async approveMilestone(contractId, milestoneId, userId) {
    return this.approveMilestoneWork(contractId, milestoneId, userId);
  }

  /**
   * Start contract (pending → active)
   * Can be triggered by client or freelancer
   */
  async startContract(contractId, userId) {
    const contract = await Contract.findById(contractId);
    if (!contract) {
      throw createAppError('Contract not found', 404);
    }

    // Verify user is participant
    if (!contract.isClient(userId) && !contract.isFreelancer(userId)) {
      throw createAppError('Only contract participants can start the contract', 403);
    }

    // Verify status
    if (contract.status !== CONTRACT_STATUS.PENDING) {
      throw createAppError(`Cannot start contract in ${contract.status} status`, 400);
    }

    // Verify escrow is funded
    if (contract.paymentStatus !== 'COMPLETED') {
      throw createAppError('Cannot start contract until payment is completed', 400);
    }

    // Update status
    contract.status = CONTRACT_STATUS.ACTIVE;
    contract.startDate = new Date();
    await contract.save();

    // Update job status to in-progress when contract starts
    try {
      await markJobInProgress(contract.job);
    } catch (error) {
      // Log but don't fail contract start if job update fails
      console.error('Failed to update job status to in-progress:', error.message);
    }

    await createAuditLog({
      adminId: userId,
      action: 'CONTRACT_STARTED',
      targetType: 'Contract',
      targetId: contractId,
      details: { startedBy: userId },
    });

    return contract;
  }

  /**
   * Submit work for review (active → in_review)
   * Only freelancer can submit
   */
  async submitWork(contractId, freelancerId, deliverables) {
    const contract = await Contract.findById(contractId);
    if (!contract) {
      throw createAppError('Contract not found', 404);
    }

    // Verify user is freelancer
    if (!contract.isFreelancer(freelancerId)) {
      throw createAppError('Only the freelancer can submit work', 403);
    }

    // Verify status
    if (contract.status !== CONTRACT_STATUS.ACTIVE) {
      throw createAppError(`Cannot submit work in ${contract.status} status`, 400);
    }

    // Add deliverables
    if (!deliverables || deliverables.length === 0) {
      throw createAppError('At least one deliverable is required', 400);
    }

    const newDeliverables = deliverables.map(d => ({
      ...d,
      submittedAt: new Date(),
      submittedBy: freelancerId,
    }));

    contract.deliverables.push(...newDeliverables);
    contract.submittedAt = new Date();
    contract.submittedBy = freelancerId;
    contract.status = CONTRACT_STATUS.IN_REVIEW;
    
    await contract.save();

    // Populate contract details for notification
    await contract.populate([{ path: 'client' }, { path: 'freelancer' }]);

    await createAuditLog({
      adminId: freelancerId,
      action: 'WORK_SUBMITTED',
      targetType: 'Contract',
      targetId: contractId,
      details: { deliverableCount: deliverables.length },
    });

    // Send notification to client
    try {
      await notifyUser(contract.client._id || contract.client, {
        type: 'CONTRACT_WORK_SUBMITTED',
        title: 'Work Submitted for Review',
        message: `${contract.freelancer.name} has submitted work for "${contract.title}". Please review the deliverables.`,
        link: `/contracts/${contractId}`,
        data: {
          contractId: contractId,
          freelancerId: freelancerId,
          deliverableCount: deliverables.length,
        },
      });

      // Emit real-time socket event
      emitContractEvent(contractId, 'work_submitted', {
        clientId: contract.client._id || contract.client,
        freelancerId: freelancerId,
        status: CONTRACT_STATUS.IN_REVIEW,
      });
    } catch (error) {
      console.error('Failed to send work submission notification:', error);
    }

    return contract;
  }

  /**
   * Approve work and release payment (in_review → completed)
   * Only client can approve
   * @param {string} contractId - Contract ID
   * @param {string} clientId - Client user ID
   * @param {Object} reviewData - Optional review data { rating, comment }
   */
  async approveWork(contractId, clientId, reviewData = null) {
    const contract = await Contract.findById(contractId);
    if (!contract) {
      throw createAppError('Contract not found', 404);
    }

    // Verify user is client
    if (!contract.isClient(clientId)) {
      throw createAppError('Only the client can approve work', 403);
    }

    // Verify status
    if (contract.status !== CONTRACT_STATUS.IN_REVIEW) {
      throw createAppError(`Cannot approve work in ${contract.status} status`, 400);
    }

    // Release escrow payment (with 5% platform fee!)
    let paymentDetails = null;
    if (contract.initialEscrowId) {
      // Check if escrow is already released (prevents trying to release twice)
      const Escrow = (await import('../../models/Escrow.js')).default;
      const escrow = await Escrow.findById(contract.initialEscrowId);
      
      if (escrow && escrow.status === 'RELEASED') {
        // Use stored payment details if escrow already released
        paymentDetails = contract.paymentDetails || {
          grossAmount: contract.totalAmount,
          platformFee: contract.totalAmount * 0.05,
          netAmount: contract.totalAmount * 0.95,
          feePercentage: 5,
        };
      } else if (escrow && ['FUNDED', 'LOCKED'].includes(escrow.status)) {
        // Only release if in FUNDED or LOCKED status
        const result = await escrowService.releaseEscrow(contract.initialEscrowId.toString(), clientId);
        paymentDetails = result.paymentDetails;
      } else {
      }
    }

    // Update contract
    contract.status = CONTRACT_STATUS.COMPLETED;
    contract.completedAt = new Date();
    contract.reviewedAt = new Date();
    contract.reviewedBy = clientId;
    
    // Store payment details on contract for reference
    if (paymentDetails) {
      contract.paymentDetails = {
        grossAmount: paymentDetails.grossAmount,
        platformFee: paymentDetails.platformFee,
        netAmount: paymentDetails.netAmount,
        feePercentage: paymentDetails.feePercentage,
        paidAt: new Date(),
      };
    }
    
    // Add client's review of freelancer (if provided)
    if (reviewData && reviewData.rating) {
      contract.clientReview = {
        rating: reviewData.rating,
        comment: reviewData.comment || '',
        createdAt: new Date(),
      };
      
      // Recalculate freelancer's rating after adding review
      // Note: ReviewService is exported as a singleton instance, not a class
      const reviewService = (await import('../reviews/review.service.js')).default;
      await reviewService.recalculateUserRating(contract.freelancer.toString());
    }
    
    await contract.save();

    // Populate for notification
    await contract.populate([{ path: 'client' }, { path: 'freelancer' }]);

    // Update job status to completed when work is approved
    try {
      await markJobCompleted(contract.job);
    } catch (error) {
      // Log but don't fail work approval if job update fails
      console.error('Failed to update job status to completed:', error.message);
    }

    // Update user statistics for both client and freelancer
    try {
      const amountPaid = paymentDetails?.grossAmount || contract.totalAmount || contract.agreedAmount || 0;
      
      // Update client statistics
      await User.findByIdAndUpdate(clientId, {
        $inc: { 
          completedJobsCount: 1,
          totalSpent: amountPaid
        }
      });

      // Update freelancer statistics
      const freelancerId = contract.freelancer._id || contract.freelancer;
      const freelancerEarnings = paymentDetails?.netAmount || (amountPaid * 0.95);
      await User.findByIdAndUpdate(freelancerId, {
        $inc: { 
          completedJobsCount: 1,
          totalEarnings: freelancerEarnings
        }
      });
    } catch (statsError) {
      // Log but don't fail the approval if stats update fails
      console.error('[CONTRACT][APPROVE_WORK] Failed to update user statistics:', statsError.message);
    }

    await createAuditLog({
      adminId: clientId,
      action: 'WORK_APPROVED',
      targetType: 'Contract',
      targetId: contractId,
      details: { 
        completedAt: contract.completedAt,
        rating: reviewData?.rating,
        paymentDetails,
      },
    });

    // Send notification to freelancer with payment breakdown
    try {
      const paymentMessage = paymentDetails 
        ? `Payment of PKR ${paymentDetails.netAmount.toLocaleString()} has been released (after ${paymentDetails.feePercentage}% platform fee).`
        : `Payment has been released!`;

      await notifyUser(contract.freelancer._id || contract.freelancer, {
        type: 'CONTRACT_WORK_APPROVED',
        title: '🎉 Work Approved!',
        message: `${contract.client.name} has approved your work for "${contract.title}". ${paymentMessage}`,
        link: `/contracts/${contractId}`,
        data: {
          contractId: contractId,
          clientId: clientId,
          amount: paymentDetails?.netAmount || contract.totalAmount,
          grossAmount: paymentDetails?.grossAmount || contract.totalAmount,
          platformFee: paymentDetails?.platformFee || 0,
          feePercentage: paymentDetails?.feePercentage || 5,
          rating: reviewData?.rating,
        },
      });

      // Emit real-time socket event
      emitContractEvent(contractId, 'work_approved', {
        clientId: clientId,
        freelancerId: contract.freelancer._id || contract.freelancer,
        status: CONTRACT_STATUS.COMPLETED,
        amount: paymentDetails?.netAmount || contract.totalAmount,
        grossAmount: paymentDetails?.grossAmount || contract.totalAmount,
        platformFee: paymentDetails?.platformFee || 0,
      });
    } catch (error) {
      console.error('Failed to send work approval notification:', error);
    }

    // TODO: Schedule auto-close after 14 days

    return contract;
  }

  /**
   * Request revision (in_review → active)
   * Only client can request revisions
   */
  async requestRevision(contractId, clientId, feedback) {
    const contract = await Contract.findById(contractId);
    if (!contract) {
      throw createAppError('Contract not found', 404);
    }

    // Verify user is client
    if (!contract.isClient(clientId)) {
      throw createAppError('Only the client can request revisions', 403);
    }

    // Verify status
    if (contract.status !== CONTRACT_STATUS.IN_REVIEW) {
      throw createAppError(`Cannot request revision in ${contract.status} status`, 400);
    }

    // Add revision request
    contract.revisions.push({
      requestedAt: new Date(),
      requestedBy: clientId,
      feedback: feedback || '',
    });
    
    contract.revisionCount += 1;
    contract.status = CONTRACT_STATUS.ACTIVE;
    
    await contract.save();

    // Populate for notification
    await contract.populate([{ path: 'client' }, { path: 'freelancer' }]);

    await createAuditLog({
      adminId: clientId,
      action: 'REVISION_REQUESTED',
      targetType: 'Contract',
      targetId: contractId,
      details: { revisionCount: contract.revisionCount, feedback },
    });

    // Send notification to freelancer
    try {
      await notifyUser(contract.freelancer._id || contract.freelancer, {
        type: 'CONTRACT_REVISION_REQUESTED',
        title: 'Revision Requested',
        message: `${contract.client.name} has requested revisions for "${contract.title}". Please review the feedback and resubmit.`,
        link: `/contracts/${contractId}`,
        data: {
          contractId: contractId,
          clientId: clientId,
          revisionCount: contract.revisionCount,
          feedback: feedback,
        },
      });

      // Emit real-time socket event
      emitContractEvent(contractId, 'revision_requested', {
        clientId: clientId,
        freelancerId: contract.freelancer._id || contract.freelancer,
        status: CONTRACT_STATUS.ACTIVE,
        revisionCount: contract.revisionCount,
      });
    } catch (error) {
      console.error('Failed to send revision request notification:', error);
    }

    return contract;
  }

  /**
   * Close contract (completed → closed)
   * Can be done by client or auto-close after 14 days
   */
  async closeContract(contractId, userId = null) {
    const contract = await Contract.findById(contractId);
    if (!contract) {
      throw createAppError('Contract not found', 404);
    }

    // If userId provided, verify they're the client
    if (userId && !contract.isClient(userId)) {
      throw createAppError('Only the client can close the contract', 403);
    }

    // Verify status
    if (contract.status !== CONTRACT_STATUS.COMPLETED) {
      throw createAppError(`Cannot close contract in ${contract.status} status`, 400);
    }

    // Update status
    contract.status = CONTRACT_STATUS.CLOSED;
    await contract.save();

    await createAuditLog({
      adminId: userId || 'SYSTEM',
      action: 'CONTRACT_CLOSED',
      targetType: 'Contract',
      targetId: contractId,
      details: { closedBy: userId || 'auto' },
    });

    return contract;
  }
}

export default new ContractService();
