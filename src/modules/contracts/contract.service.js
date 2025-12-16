import Contract from '../../models/Contract.js';
import Proposal from '../../models/Proposal.js';
import Job from '../../models/Job.js';
import Conversation from '../../models/Conversation.js';
import AppError from '../../core/errors/AppError.js';
import { createAuditLog } from '../../core/utils/auditLogger.js';

class ContractService {
  /**
   * Create a contract from an accepted proposal
   */
  async createFromProposal(proposalId, clientId, contractData) {
    try {
      console.log('🟢 [createFromProposal Service] Started');
      console.log('🟢 Proposal ID:', proposalId);
      console.log('🟢 Client ID:', clientId);
      console.log('🟢 Contract Data:', JSON.stringify(contractData, null, 2));

      // Validate clientId
      if (!clientId) {
        console.log('🔴 Client ID is undefined!');
        throw AppError('Not authenticated', 401);
      }

      // Validate proposal
      console.log('🟢 Finding proposal...');
      const proposal = await Proposal.findById(proposalId)
        .populate('jobId')
        .populate('freelancerId');

      if (!proposal) {
        console.log('🔴 Proposal not found!');
        throw AppError('Proposal not found', 404);
      }
      console.log('🟢 Proposal found:', proposal._id, 'Status:', proposal.status);

      // Check if jobId and freelancerId are populated
      if (!proposal.jobId) {
        console.log('🔴 Job not populated or not found!');
        throw AppError('Job associated with proposal not found', 404);
      }
      if (!proposal.freelancerId) {
        console.log('🔴 Freelancer not populated or not found!');
        throw AppError('Freelancer associated with proposal not found', 404);
      }

      if (proposal.status !== 'accepted') {
        console.log('🔴 Proposal status is not accepted:', proposal.status);
        throw AppError('Only accepted proposals can be converted to contracts', 400);
      }
      console.log('🟢 Proposal status is accepted');

      // Check if contract already exists
      console.log('🟢 Checking for existing contract...');
      const existingContract = await Contract.findOne({ proposal: proposalId });
      if (existingContract) {
        console.log('🔴 Contract already exists:', existingContract._id);
        throw AppError('Contract already exists for this proposal', 400);
      }
      console.log('🟢 No existing contract found');

      // Verify client owns the job
      console.log('🟢 Verifying client ownership...');
      console.log('🟢 Job client ID:', proposal.jobId.client);
      console.log('🟢 Current client ID:', clientId);

      if (!proposal.jobId.client) {
        console.log('🔴 Job client is undefined!');
        throw AppError('Job client information is missing', 500);
      }

      // Safely compare IDs
      const jobClientStr = proposal.jobId.client.toString();
      const currentClientStr = clientId.toString();

      console.log('🟢 Comparing - Job client:', jobClientStr, 'vs Current client:', currentClientStr);

      if (jobClientStr !== currentClientStr) {
        console.log('🔴 Client mismatch!');
        throw AppError('Only the job client can create a contract', 403);
      }
      console.log('🟢 Client verification passed');

      // Create contract
      console.log('🟢 Creating contract object...');

      const jobId = proposal.jobId._id || proposal.jobId;
      const freelancerId = proposal.freelancerId._id || proposal.freelancerId;

      console.log('🟢 Extracted IDs - Job:', jobId, 'Client:', jobClientStr, 'Freelancer:', freelancerId);

      const contract = new Contract({
        job: jobId,
        proposal: proposal._id,
        client: jobClientStr,
        freelancer: freelancerId,
        title: proposal.jobId.title || 'Untitled Contract',
        description: proposal.coverLetter || proposal.jobId.description || 'No description provided',
        totalAmount: proposal.bidAmount,
        paymentType: proposal.paymentType || 'fixed',
        hourlyRate: proposal.hourlyRate,
        estimatedHours: proposal.estimatedHours,
        terms: contractData.terms,
        deadline: contractData.deadline,
        milestones: contractData.milestones || [],
        status: 'pending',
      });
      console.log('🟢 Contract object created, saving...');

      await contract.save();
      console.log('🟢 Contract saved successfully:', contract._id);

      // Create conversation for contract
      console.log('🟢 Creating conversation...');
      await Conversation.findOrCreate(
        [contract.client, contract.freelancer],
        {
          job: contract.job,
          contract: contract._id,
          type: 'contract',
          metadata: {
            jobTitle: proposal.jobId.title || 'Contract',
            contractStatus: 'pending',
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

      return populatedContract;
    } catch (error) {
      console.log('🔴 ERROR in createFromProposal:', error.message);
      console.log('🔴 ERROR stack:', error.stack);
      throw error;
    }
  }

  /**
   * Get contract by ID
   */
  async getContractById(contractId, userId) {
    const contract = await Contract.findById(contractId)
      .populate('client', 'name email avatar role')
      .populate('freelancer', 'name email avatar role')
      .populate('job', 'title description budget')
      .populate('proposal');

    if (!contract) {
      throw AppError('Contract not found', 404);
    }

    // Verify access
    if (!contract.canBeModifiedBy(userId)) {
      throw AppError('You do not have access to this contract', 403);
    }

    return contract;
  }

  /**
   * Get contracts for a user
   * Returns only contracts where user is either client or freelancer
   */
  async getContractsByUser(userId, filters = {}, userRole = null) {
    // Build query based on user's role to ensure proper access control
    let query = {};
    
    // If role filter is explicitly provided, use it
    if (filters.role === 'client') {
      query.client = userId;
    } else if (filters.role === 'freelancer') {
      query.freelancer = userId;
    } else if (userRole === 'client') {
      // For clients, only show contracts they created
      query.client = userId;
    } else if (userRole === 'freelancer') {
      // For freelancers, only show contracts where they are the freelancer
      query.freelancer = userId;
    } else {
      // Fallback: show contracts where user is either party
      query.$or = [{ client: userId }, { freelancer: userId }];
    }

    if (filters.status) {
      query.status = filters.status;
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
   */
  async respondToContract(contractId, userId, action, reason) {
    const contract = await Contract.findById(contractId);

    if (!contract) {
      throw AppError('Contract not found', 404);
    }

    if (contract.status !== 'pending') {
      throw AppError('Contract is not in pending status', 400);
    }

    // Only freelancer can accept/decline
    if (contract.freelancer.toString() !== userId.toString()) {
      throw AppError('Only the freelancer can respond to the contract', 403);
    }

    if (action === 'accept') {
      contract.status = 'active';
      contract.startDate = new Date();
    } else if (action === 'decline') {
      contract.status = 'cancelled';
      contract.cancelledAt = new Date();
      contract.cancelledBy = userId;
      contract.cancellationReason = reason || 'Declined by freelancer';
    }

    await contract.save();

    // Update conversation metadata
    await Conversation.findOneAndUpdate(
      { contract: contract._id },
      { 'metadata.contractStatus': contract.status }
    );

    // Log activity
    // TODO: Fix audit logging API
    // await createAuditLog({
    //   adminId: userId,
    //   action: `CONTRACT_${action.toUpperCase()}ED`,
    //   targetType: 'Contract',
    //   targetId: contract._id.toString(),
    //   details: {
    //     previousStatus: 'pending',
    //     newStatus: contract.status,
    //     reason,
    //   },
    // });

    return contract.populate([
      { path: 'client', select: 'name email avatar' },
      { path: 'freelancer', select: 'name email avatar' },
      { path: 'job', select: 'title' },
    ]);
  }

  /**
   * Add milestone to contract
   */
  async addMilestone(contractId, userId, milestoneData) {
    const contract = await Contract.findById(contractId);

    if (!contract) {
      throw AppError('Contract not found', 404);
    }

    if (!contract.canBeModifiedBy(userId)) {
      throw AppError('You do not have access to this contract', 403);
    }

    if (!contract.canAddMilestone()) {
      throw AppError('Cannot add milestone to this contract', 400);
    }

    // Only client can add milestones
    if (contract.client.toString() !== userId.toString()) {
      throw AppError('Only the client can add milestones', 403);
    }

    contract.milestones.push(milestoneData);
    await contract.save();

    // TODO: Fix audit logging API
    // await createAuditLog({
    //   adminId: userId,
    //   action: 'MILESTONE_ADDED',
    //   targetType: 'Contract',
    //   targetId: contract._id.toString(),
    //   details: {
    //     milestoneTitle: milestoneData.title,
    //     milestoneAmount: milestoneData.amount,
    //   },
    // });

    return contract;
  }

  /**
   * Update milestone
   */
  async updateMilestone(contractId, milestoneId, userId, updateData) {
    const contract = await Contract.findById(contractId);

    if (!contract) {
      throw AppError('Contract not found', 404);
    }

    if (!contract.canBeModifiedBy(userId)) {
      throw AppError('You do not have access to this contract', 403);
    }

    const milestone = contract.milestones.id(milestoneId);
    if (!milestone) {
      throw AppError('Milestone not found', 404);
    }

    // Update milestone fields
    Object.keys(updateData).forEach((key) => {
      milestone[key] = updateData[key];
    });

    // If marking as completed, set completedAt
    if (updateData.status === 'completed' && !milestone.completedAt) {
      milestone.completedAt = new Date();
    }

    await contract.save();

    // TODO: Fix audit logging API
    // await createAuditLog({
    //   adminId: userId,
    //   action: 'MILESTONE_UPDATED',
    //   targetType: 'Contract',
    //   targetId: contract._id.toString(),
    //   details: {
    //     milestoneId,
    //     milestoneTitle: milestone.title,
    //     updates: updateData,
    //   },
    // });

    return contract;
  }

  /**
   * Complete contract
   */
  async completeContract(contractId, userId) {
    const contract = await Contract.findById(contractId);

    if (!contract) {
      throw AppError('Contract not found', 404);
    }

    if (!contract.canBeModifiedBy(userId)) {
      throw AppError('You do not have access to this contract', 403);
    }

    if (contract.status !== 'active') {
      throw AppError('Only active contracts can be completed', 400);
    }

    // Only client can complete contract
    if (contract.client.toString() !== userId.toString()) {
      throw AppError('Only the client can complete the contract', 403);
    }

    contract.status = 'completed';
    contract.completedAt = new Date();
    contract.endDate = new Date();

    await contract.save();

    // Update conversation
    await Conversation.findOneAndUpdate(
      { contract: contract._id },
      { 'metadata.contractStatus': 'completed' }
    );

    // TODO: Fix audit logging API
    // await createAuditLog({
    //   adminId: userId,
    //   action: 'CONTRACT_COMPLETED',
    //   targetType: 'Contract',
    //   targetId: contract._id.toString(),
    //   details: {
    //     totalAmount: contract.totalAmount,
    //     duration: contract.endDate - contract.startDate,
    //   },
    // });

    return contract;
  }

  /**
   * Cancel contract
   */
  async cancelContract(contractId, userId, reason) {
    const contract = await Contract.findById(contractId);

    if (!contract) {
      throw AppError('Contract not found', 404);
    }

    if (!contract.canBeModifiedBy(userId)) {
      throw AppError('You do not have access to this contract', 403);
    }

    if (!['pending', 'active'].includes(contract.status)) {
      throw AppError('Cannot cancel contract in current status', 400);
    }

    contract.status = 'cancelled';
    contract.cancelledAt = new Date();
    contract.cancelledBy = userId;
    contract.cancellationReason = reason;

    await contract.save();

    await Conversation.findOneAndUpdate(
      { contract: contract._id },
      { 'metadata.contractStatus': 'cancelled' }
    );

    // TODO: Fix audit logging API
    // await createAuditLog({
    //   adminId: userId,
    //   action: 'CONTRACT_CANCELLED',
    //   targetType: 'Contract',
    //   targetId: contract._id.toString(),
    //   details: {
    //     reason,
    //     cancelledBy: userId,
    //   },
    // });

    return contract;
  }

  /**
   * Get contract statistics
   */
  async getContractStats(userId) {
    const contracts = await Contract.find({
      $or: [{ client: userId }, { freelancer: userId }],
    });

    const stats = {
      total: contracts.length,
      active: contracts.filter((c) => c.status === 'active').length,
      completed: contracts.filter((c) => c.status === 'completed').length,
      pending: contracts.filter((c) => c.status === 'pending').length,
      cancelled: contracts.filter((c) => c.status === 'cancelled').length,
      totalEarned: 0,
      totalSpent: 0,
    };

    contracts.forEach((contract) => {
      if (contract.status === 'completed') {
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
}

export default new ContractService();
