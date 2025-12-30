import Dispute from '../../models/Dispute.js';
import Contract from '../../models/Contract.js';
import { createAuditLog } from '../../core/utils/auditLogger.js';
import escrowService from '../payments/escrow.service.js';

class DisputeService {
  /**
   * Create a new dispute
   */
  async createDispute(disputeData, userId) {
    const { contractId, reason, description, evidence } = disputeData;

    // Verify contract exists
    const contract = await Contract.findById(contractId);
    if (!contract) {
      throw new Error('Contract not found');
    }

    // Determine who raised the dispute
    let raisedBy;
    // contract.client and contract.freelancer are ObjectIds
    const clientIdStr = contract.client?.toString();
    const freelancerIdStr = contract.freelancer?.toString();

    if (clientIdStr === userId.toString()) {
      raisedBy = 'client';
    } else if (freelancerIdStr === userId.toString()) {
      raisedBy = 'freelancer';
    } else {
      throw new Error('You are not authorized to raise a dispute for this contract');
    }

    // Create dispute
    const dispute = await Dispute.create({
      contractId,
      raisedBy,
      raisedByUserId: userId,
      reason,
      description,
      evidence: evidence || [],
      status: 'OPEN',
    });

    // Update contract status to indicate there's a dispute
    if (contract.status !== 'disputed') {
      contract.status = 'disputed';
      await contract.save();
    }

    // Freeze all escrows for this contract
    try {
      const escrows = await escrowService.getEscrowByContract(contractId);
      for (const escrow of escrows) {
        if (escrow.status === 'FUNDED' || escrow.status === 'LOCKED') {
          await escrowService.freezeEscrow(escrow._id.toString());
        }
      }
    } catch (error) {
      console.error('Failed to freeze escrows for dispute:', error.message);
      // Don't fail dispute creation if escrow freeze fails
    }

    // Create audit log
    await createAuditLog({
      action: 'DISPUTE_CREATED',
      userId,
      targetType: 'Dispute',
      targetId: dispute.disputeId,
      details: {
        contractId,
        reason,
        raisedBy,
      },
    });

    return dispute;
  }

  /**
   * Get all disputes (admin only)
   */
  async getAllDisputes(filters = {}, options = {}) {
    const result = await Dispute.getDisputes(filters, options);
    return result;
  }

  /**
   * Get dispute by ID
   */
  async getDisputeById(disputeId) {
    const dispute = await Dispute.findOne({ disputeId })
      .populate('contract')
      .populate('raisedByUser', 'name email profilePicture role')
      .populate('resolvedBy', 'name email')
      .populate({
        path: 'adminNotes.addedBy',
        select: 'name email',
      });

    if (!dispute) {
      throw new Error('Dispute not found');
    }

    return dispute;
  }

  /**
   * Get disputes by contract ID
   */
  async getDisputesByContract(contractId) {
    const disputes = await Dispute.find({ contractId })
      .populate('raisedByUser', 'name email profilePicture')
      .populate('resolvedBy', 'name email')
      .sort('-createdAt');

    return disputes;
  }

  /**
   * Resolve a dispute (admin only)
   */
  async resolveDispute(disputeId, resolution, adminId) {
    const dispute = await Dispute.findOne({ disputeId });
    if (!dispute) {
      throw new Error('Dispute not found');
    }

    if (dispute.status !== 'OPEN') {
      throw new Error('Only open disputes can be resolved');
    }

    await dispute.resolve(resolution, adminId);

    // Update contract status back to active if no other open disputes
    const openDisputes = await Dispute.countDocuments({
      contractId: dispute.contractId,
      status: 'OPEN',
    });

    if (openDisputes === 0) {
      const contract = await Contract.findById(dispute.contractId);
      if (contract && contract.status === 'disputed') {
        contract.status = 'active';
        await contract.save();
      }
    }

    // Create audit log
    await createAuditLog({
      action: 'DISPUTE_RESOLVED',
      userId: adminId,
      targetType: 'Dispute',
      targetId: dispute.disputeId,
      details: {
        contractId: dispute.contractId,
        resolution,
      },
    });

    return dispute;
  }

  /**
   * Resolve dispute with payment actions (admin only)
   * @param {string} disputeId - Dispute ID
   * @param {string} resolution - Resolution text
   * @param {Object} escrowActions - Escrow actions (release/refund)
   * @param {string} adminId - Admin user ID
   * @returns {Promise<Object>} Resolved dispute
   */
  async resolveDisputeWithPayment(disputeId, resolution, escrowActions, adminId) {
    const dispute = await Dispute.findOne({ disputeId });
    if (!dispute) {
      throw new Error('Dispute not found');
    }

    if (dispute.status !== 'OPEN') {
      throw new Error('Only open disputes can be resolved');
    }

    // Get all escrows for the contract
    const escrows = await escrowService.getEscrowByContract(dispute.contractId);

    // Process escrow actions
    for (const action of escrowActions) {
      const { escrowId, action: actionType, amount, toUserId } = action;

      if (actionType === 'release') {
        if (amount && amount < escrow.amount) {
          // Partial release
          await escrowService.adminReleaseEscrow(escrowId, adminId, {
            partialAmount: amount,
            toUserId: toUserId || escrow.freelancerId,
          });
        } else {
          // Full release
          await escrowService.adminReleaseEscrow(escrowId, adminId, {});
        }
      } else if (actionType === 'refund') {
        await escrowService.adminRefundEscrow(escrowId, adminId, resolution);
      }
    }

    // Resolve dispute
    await dispute.resolve(resolution, adminId);

    // Update contract status back to active if no other open disputes
    const openDisputes = await Dispute.countDocuments({
      contractId: dispute.contractId,
      status: 'OPEN',
    });

    if (openDisputes === 0) {
      const contract = await Contract.findById(dispute.contractId);
      if (contract && contract.status === 'disputed') {
        contract.status = 'active';
        await contract.save();
      }
    }

    // Create audit log
    await createAuditLog({
      action: 'DISPUTE_RESOLVED_WITH_PAYMENT',
      userId: adminId,
      targetType: 'Dispute',
      targetId: dispute.disputeId,
      details: {
        contractId: dispute.contractId,
        resolution,
        escrowActions,
      },
    });

    return dispute;
  }

  /**
   * Reject a dispute (admin only)
   */
  async rejectDispute(disputeId, reason, adminId) {
    const dispute = await Dispute.findOne({ disputeId });
    if (!dispute) {
      throw new Error('Dispute not found');
    }

    if (dispute.status !== 'OPEN') {
      throw new Error('Only open disputes can be rejected');
    }

    await dispute.reject(reason, adminId);

    // Update contract status back to active if no other open disputes
    const openDisputes = await Dispute.countDocuments({
      contractId: dispute.contractId,
      status: 'OPEN',
    });

    if (openDisputes === 0) {
      const contract = await Contract.findById(dispute.contractId);
      if (contract && contract.status === 'disputed') {
        contract.status = 'active';
        await contract.save();
      }
    }

    // Create audit log
    await createAuditLog({
      action: 'DISPUTE_REJECTED',
      userId: adminId,
      targetType: 'Dispute',
      targetId: dispute.disputeId,
      details: {
        contractId: dispute.contractId,
        reason,
      },
    });

    return dispute;
  }

  /**
   * Add admin note to dispute
   */
  async addAdminNote(disputeId, note, adminId) {
    const dispute = await Dispute.findOne({ disputeId });
    if (!dispute) {
      throw new Error('Dispute not found');
    }

    await dispute.addAdminNote(note, adminId);

    // Create audit log
    await createAuditLog({
      action: 'DISPUTE_NOTE_ADDED',
      userId: adminId,
      targetType: 'Dispute',
      targetId: dispute.disputeId,
      details: {
        note,
      },
    });

    return dispute;
  }

  /**
   * Get dispute statistics (admin dashboard)
   */
  async getDisputeStats() {
    const [
      totalDisputes,
      openDisputes,
      resolvedDisputes,
      rejectedDisputes,
      recentDisputes,
    ] = await Promise.all([
      Dispute.countDocuments(),
      Dispute.countDocuments({ status: 'OPEN' }),
      Dispute.countDocuments({ status: 'RESOLVED' }),
      Dispute.countDocuments({ status: 'REJECTED' }),
      Dispute.find({ status: 'OPEN' })
        .populate('contract')
        .populate('raisedByUser', 'name email')
        .sort('-createdAt')
        .limit(5)
        .lean(),
    ]);

    return {
      total: totalDisputes,
      open: openDisputes,
      resolved: resolvedDisputes,
      rejected: rejectedDisputes,
      recentDisputes,
    };
  }

  /**
   * Update dispute status
   */
  async updateDisputeStatus(disputeId, status, adminId, notes) {
    const dispute = await Dispute.findOne({ disputeId });
    if (!dispute) {
      throw new Error('Dispute not found');
    }

    const oldStatus = dispute.status;
    dispute.status = status;

    if (status === 'RESOLVED' || status === 'REJECTED') {
      dispute.resolvedBy = adminId;
      dispute.resolvedAt = new Date();
      if (notes) {
        dispute.resolution = notes;
      }
    }

    await dispute.save();

    // Create audit log
    await createAuditLog({
      action: 'DISPUTE_STATUS_UPDATED',
      userId: adminId,
      targetType: 'Dispute',
      targetId: dispute.disputeId,
      details: {
        oldStatus,
        newStatus: status,
        notes,
      },
    });

    return dispute;
  }
}

export default new DisputeService();
