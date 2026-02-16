import Contract from '../../models/Contract.js';
import Proposal from '../../models/Proposal.js';
import Job from '../../models/Job.js';
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
} from './contract.constants.js';
import escrowService from '../payments/escrow.service.js';
import paymentService from '../payments/payment.service.js';
import walletService from '../payments/wallet.service.js';
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
      console.log('🟢 [createFromProposal Service] Started');
      console.log('🟢 Proposal ID:', proposalId);
      console.log('🟢 Client ID:', clientId);
      console.log('🟢 Contract Data:', JSON.stringify(contractData, null, 2));

      // Business Rule: Validate authentication
      if (!clientId) {
        console.log('🔴 Client ID is undefined!');
        throw createAppError('Not authenticated', 401);
      }

      // Business Rule: Validate proposal exists and populate related data
      console.log('🟢 Finding proposal...');
      const proposal = await Proposal.findById(proposalId)
        .populate('jobId')
        .populate('freelancerId');

      if (!proposal) {
        console.log('🔴 Proposal not found!');
        throw createAppError('Proposal not found', 404);
      }
      console.log('🟢 Proposal found:', proposal._id, 'Status:', proposal.status);

      // Business Rule: Validate related entities exist
      if (!proposal.jobId) {
        console.log('🔴 Job not populated or not found!');
        throw createAppError('Job associated with proposal not found', 404);
      }
      if (!proposal.freelancerId) {
        console.log('🔴 Freelancer not populated or not found!');
        throw createAppError('Freelancer associated with proposal not found', 404);
      }

      // Business Rule: Only accepted proposals can be converted to contracts
      if (proposal.status !== 'accepted') {
        console.log('🔴 Proposal status is not accepted:', proposal.status);
        throw createAppError('Only accepted proposals can be converted to contracts', 400);
      }
      console.log('🟢 Proposal status is accepted');

      // Business Rule: Prevent duplicate contracts for same proposal
      console.log('🟢 Checking for existing contract...');
      const existingContract = await Contract.findOne({ proposal: proposalId });
      if (existingContract) {
        console.log('🔴 Contract already exists:', existingContract._id);
        throw createAppError('Contract already exists for this proposal', 400);
      }
      console.log('🟢 No existing contract found');

      // Business Rule: Only job owner (client) can create contract
      console.log('🟢 Verifying client ownership...');
      console.log('🟢 Job client ID:', proposal.jobId.client);
      console.log('🟢 Current client ID:', clientId);

      if (!proposal.jobId.client) {
        console.log('🔴 Job client is undefined!');
        throw createAppError('Job client information is missing', 500);
      }

      // Safely compare IDs
      const jobClientStr = proposal.jobId.client.toString();
      const currentClientStr = clientId.toString();
      const freelancerStr = (proposal.freelancerId._id || proposal.freelancerId).toString();

      console.log('🟢 Comparing - Job client:', jobClientStr, 'vs Current client:', currentClientStr);

      if (jobClientStr !== currentClientStr) {
        console.log('🔴 Client mismatch!');
        throw createAppError('Only the job client can create a contract', 403);
      }
      console.log('🟢 Client verification passed');

      // Business Rule: Client and freelancer must be different users
      if (currentClientStr === freelancerStr) {
        console.log('🔴 Client and freelancer are the same user!');
        throw createAppError('Client and freelancer must be different users', 400);
      }
      console.log('🟢 Client and freelancer are different users');

      const jobId = proposal.jobId._id || proposal.jobId;
      const freelancerId = proposal.freelancerId._id || proposal.freelancerId;

      console.log('🟢 Extracted IDs - Job:', jobId, 'Client:', jobClientStr, 'Freelancer:', freelancerId);

      // Calculate total amount (use totalAmount or sum of milestones)
      const totalAmount = contractData.totalAmount || 
        (contractData.milestones && contractData.milestones.length > 0
          ? contractData.milestones.reduce((sum, m) => sum + (m.amount || 0), 0)
          : proposal.bidAmount);

      console.log('🟢 Total amount calculated:', totalAmount);

      // Validate payment data is provided
      if (!paymentData || !paymentData.paymentMethod) {
        throw createAppError('Payment method is required to create contract', 400);
      }

      // Create escrow for total contract amount BEFORE creating contract
      console.log('🟢 Creating contract-level escrow...');
      const escrow = await escrowService.createEscrow(
        null, // contractId not yet created
        'TOTAL', // special milestoneId for total contract escrow
        totalAmount,
        {
          clientId: jobClientStr,
          freelancerId: freelancerId,
        }
      );
      console.log('🟢 Escrow created:', escrow._id);

      let paymentResult;
      let isWalletPayment = paymentData.paymentMethod === 'WALLET';

      if (isWalletPayment) {
        // WALLET PAYMENT: Deduct from wallet and fund escrow directly
        console.log('🟢 Processing wallet payment...');
        
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
        console.log('🟢 Funds locked from wallet:', lockResult.transaction?._id);

        // Fund escrow with wallet transaction
        await escrow.fund(lockResult.transaction?._id?.toString() || `WALLET-${Date.now()}`, 'WALLET');
        await escrow.save();
        console.log('🟢 Escrow funded with wallet payment');

        paymentResult = {
          transactionId: lockResult.transaction?._id?.toString() || `WALLET-${Date.now()}`,
          paymentUrl: null,
          requiresManualVerification: false,
          isWalletPayment: true,
        };
      } else {
        // EXTERNAL PAYMENT: Initialize deposit with escrow linking
        console.log('🟢 Initializing external payment...');
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
      console.log('🟢 Payment processed:', paymentResult.transactionId);

      // Create contract with escrow reference
      console.log('🟢 Creating contract object...');
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
      console.log('🟢 Contract object created, saving...');

      await contract.save();
      console.log('🟢 Contract saved successfully:', contract._id);

      // Link escrow to contract after creation
      escrow.contractId = contract._id;
      await escrow.save();
      console.log('🟢 Escrow linked to contract');

      // Create conversation for contract communication
      console.log('🟢 Creating conversation...');
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
      console.log('🟢 Conversation created');

      // Populate and return
      console.log('🟢 Populating contract with related data...');
      const populatedContract = await contract.populate([
        { path: 'client', select: 'name email avatar' },
        { path: 'freelancer', select: 'name email avatar' },
        { path: 'job', select: 'title description' },
      ]);
      console.log('🟢 Contract populated successfully');

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
      console.log('🔴 ERROR in createFromProposal:', error.message);
      console.log('🔴 ERROR stack:', error.stack);
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

    // [CONTRACT][AUTH] Debug authorization check
    console.log('\n========================================');
    console.log('[CONTRACT][AUTH][DEBUG] Authorization Check');
    console.log('[CONTRACT][AUTH] contractId:', contractId);
    console.log('[CONTRACT][AUTH] userId:', userId);
    console.log('[CONTRACT][AUTH] userId type:', typeof userId);
    console.log('[CONTRACT][AUTH] contract.client:', contract.client);
    console.log('[CONTRACT][AUTH] contract.client type:', typeof contract.client);
    console.log('[CONTRACT][AUTH] contract.client._id:', contract.client?._id);
    console.log('[CONTRACT][AUTH] contract.freelancer:', contract.freelancer);
    console.log('[CONTRACT][AUTH] contract.freelancer type:', typeof contract.freelancer);
    console.log('[CONTRACT][AUTH] contract.freelancer._id:', contract.freelancer?._id);
    
    // Extract IDs safely
    const clientId = (contract.client?._id || contract.client)?.toString();
    const freelancerId = (contract.freelancer?._id || contract.freelancer)?.toString();
    const userIdStr = userId?.toString();
    
    console.log('[CONTRACT][AUTH] Extracted clientId:', clientId);
    console.log('[CONTRACT][AUTH] Extracted freelancerId:', freelancerId);
    console.log('[CONTRACT][AUTH] Extracted userId:', userIdStr);
    console.log('[CONTRACT][AUTH] userId === clientId:', userIdStr === clientId);
    console.log('[CONTRACT][AUTH] userId === freelancerId:', userIdStr === freelancerId);
    console.log('[CONTRACT][AUTH] canBeViewedBy result:', contract.canBeViewedBy(userId));
    console.log('========================================\n');

    // Business Rule: Authorization - only parties involved can VIEW (read access)
    // Use canBeViewedBy for read operations, not canBeModifiedBy
    if (!contract.canBeViewedBy(userId)) {
      console.log('[CONTRACT][AUTH][ERROR] Access denied for userId:', userId);
      throw createAppError('You do not have access to this contract', 403);
    }

    console.log('[CONTRACT][AUTH][SUCCESS] Access granted for userId:', userId);
    return contract;
  }

  /**
   * Get contracts for a user
   * Returns only contracts where user is either client or freelancer
   */
  async getContractsByUser(userId, filters = {}, userRole = null) {
    // [CONTRACTS][DEBUG] 2. QUERY BUILD LOG - Start
    console.log('\n========================================');
    console.log('[CONTRACTS][DEBUG][SERVICE] getContractsByUser called');
    console.log('[CONTRACTS][DEBUG][SERVICE] userId:', userId);
    console.log('[CONTRACTS][DEBUG][SERVICE] userRole:', userRole);
    console.log('[CONTRACTS][DEBUG][SERVICE] filters:', JSON.stringify(filters));
    console.log('========================================\n');

    // Build query to show all contracts where user is either client or freelancer
    let query = {
      $or: [{ client: userId }, { freelancer: userId }],
    };

    // [CONTRACTS][DEBUG] 4. ROLE-BASED BRANCH LOG
    console.log('[CONTRACTS][DEBUG][ROLE] Initial query:', JSON.stringify(query));

    // Apply optional status filter
    if (filters.status) {
      query.status = filters.status;
      console.log('[CONTRACTS][DEBUG][FILTER] Status filter applied:', filters.status);
    }
    
    // Apply optional role filter to narrow down results
    if (filters.role === 'client') {
      console.log('[CONTRACTS][DEBUG][ROLE] Branch: CLIENT');
      query = { client: userId };
      if (filters.status) query.status = filters.status;
    } else if (filters.role === 'freelancer') {
      console.log('[CONTRACTS][DEBUG][ROLE] Branch: FREELANCER');
      query = { freelancer: userId };
      if (filters.status) query.status = filters.status;
    } else {
      console.log('[CONTRACTS][DEBUG][ROLE] Branch: BOTH (using $or)');
    }

    const page = parseInt(filters.page) || 1;
    const limit = parseInt(filters.limit) || 10;
    const skip = (page - 1) * limit;
    const sortBy = filters.sortBy || 'createdAt';
    const order = filters.order === 'asc' ? 1 : -1;

    // [CONTRACTS][DEBUG] 2. QUERY BUILD LOG - Final Query
    console.log('\n========================================');
    console.log('[CONTRACTS][DEBUG][QUERY] Final MongoDB query:', JSON.stringify(query));
    console.log('[CONTRACTS][DEBUG][QUERY] Pagination - page:', page, 'limit:', limit, 'skip:', skip);
    console.log('[CONTRACTS][DEBUG][QUERY] Sort:', sortBy, 'order:', order === 1 ? 'asc' : 'desc');
    console.log('========================================\n');

    console.log('[CONTRACTS][DEBUG][DB] Executing database query...');
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
    console.log('\n========================================');
    console.log('[CONTRACTS][DEBUG][RESULT] Query executed successfully');
    console.log('[CONTRACTS][DEBUG][RESULT] Total count (from countDocuments):', total);
    console.log('[CONTRACTS][DEBUG][RESULT] Contracts returned:', contracts.length);
    console.log('[CONTRACTS][DEBUG][RESULT] Contract IDs:', contracts.map(c => c._id.toString()));
    console.log('[CONTRACTS][DEBUG][RESULT] Contract statuses:', contracts.map(c => c.status));
    console.log('[CONTRACTS][DEBUG][RESULT] Contract clients:', contracts.map(c => c.client?._id?.toString() || c.client?.toString()));
    console.log('[CONTRACTS][DEBUG][RESULT] Contract freelancers:', contracts.map(c => c.freelancer?._id?.toString() || c.freelancer?.toString()));
    console.log('========================================\n');

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
      if (contract.paymentStatus && contract.paymentStatus !== 'COMPLETED') {
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
      await escrowService.createEscrow(
        contractId,
        addedMilestone._id.toString(),
        milestoneData.amount
      );
    } catch (error) {
      // Log error but don't fail milestone creation
      console.error('Failed to create escrow for milestone:', error.message);
    }

    return contract;
  }

  /**
   * Update milestone
   * Business Rules:
   * 1. Cannot update milestones in terminal contract states
   * 2. Only authorized users can update milestones
   * 3. completedAt is auto-set when status changes to completed
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

    // Business Rule: Validate dueDate if being updated
    if (updateData.dueDate) {
      const newDueDate = new Date(updateData.dueDate);
      
      // Ensure dueDate is not in the past
      if (newDueDate < new Date()) {
        throw createAppError('Milestone due date cannot be in the past', 400);
      }
      
      // If contract has a deadline, milestone due date should not exceed it
      if (contract.deadline && newDueDate > new Date(contract.deadline)) {
        throw createAppError('Milestone due date cannot exceed contract deadline', 400);
      }
    }

    // Update milestone fields
    Object.keys(updateData).forEach((key) => {
      milestone[key] = updateData[key];
    });

    // Business Rule: Auto-set completedAt when marking as completed
    // This is also handled in the model pre-save hook but set here for immediate effect
    if (updateData.status === MILESTONE_STATUS.COMPLETED && !milestone.completedAt) {
      milestone.completedAt = new Date();
    }

    await contract.save();

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
    }

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
   * Approve milestone and release escrow
   * Business Rules:
   * 1. Only client can approve milestone
   * 2. Milestone must be completed
   * 3. Escrow must be funded/locked
   */
  async approveMilestone(contractId, milestoneId, userId) {
    const contract = await Contract.findById(contractId);
    if (!contract) {
      throw createAppError('Contract not found', 404);
    }

    // Verify user is client
    if (!contract.isClient(userId)) {
      throw createAppError('Only the client can approve milestone', 403);
    }

    // Verify milestone exists
    const milestone = contract.milestones.id(milestoneId);
    if (!milestone) {
      throw createAppError('Milestone not found', 404);
    }

    // Verify milestone is completed
    if (milestone.status !== MILESTONE_STATUS.COMPLETED) {
      throw createAppError('Milestone must be completed before approval', 400);
    }

    // Get escrow
    const escrow = await escrowService.getEscrowByMilestone(contractId, milestoneId);
    if (!escrow) {
      throw createAppError('Escrow not found for this milestone', 404);
    }

    // Release escrow
    await escrowService.releaseEscrow(escrow._id.toString(), userId);

    return contract;
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
        console.log('[CONTRACT][APPROVE_WORK] Escrow already released, using stored payment details');
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
        console.warn('[CONTRACT][APPROVE_WORK] Escrow not found or in invalid status:', escrow?.status);
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
      console.log('[CONTRACT][APPROVE_WORK] Adding client review:', reviewData);
      contract.clientReview = {
        rating: reviewData.rating,
        comment: reviewData.comment || '',
        createdAt: new Date(),
      };
      
      // Recalculate freelancer's rating after adding review
      // Note: ReviewService is exported as a singleton instance, not a class
      const reviewService = (await import('../reviews/review.service.js')).default;
      await reviewService.recalculateUserRating(contract.freelancer.toString());
      console.log('[CONTRACT][APPROVE_WORK] Freelancer rating recalculated');
    }
    
    await contract.save();
    console.log('[CONTRACT][APPROVE_WORK] Contract saved with status:', contract.status);

    // Populate for notification
    await contract.populate([{ path: 'client' }, { path: 'freelancer' }]);

    // Update job status to completed when work is approved
    try {
      await markJobCompleted(contract.job);
    } catch (error) {
      // Log but don't fail work approval if job update fails
      console.error('Failed to update job status to completed:', error.message);
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
