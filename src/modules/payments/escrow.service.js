import Escrow from '../../models/Escrow.js';
import Contract from '../../models/Contract.js';
import walletService from './wallet.service.js';
import Transaction from '../../models/Transaction.js';
import { createAppError } from '../../core/errors/index.js';
import {
  ESCROW_STATUS,
  TRANSACTION_TYPE,
  TRANSACTION_STATUS,
  canReleaseEscrow,
  canRefundEscrow,
  canFreezeEscrow,
} from './payment.constants.js';

/**
 * Escrow Service
 * Handles escrow creation, funding, release, refund, and freezing
 */
class EscrowService {
  /**
   * Create escrow for a milestone or contract-level escrow
   * @param {string|null} contractId - Contract ID (can be null for contract-level escrow)
   * @param {string} milestoneId - Milestone ID (within contract) or 'TOTAL' for contract-level
   * @param {number} amount - Escrow amount
   * @param {Object} options - Additional options (clientId, freelancerId for contract-level escrow)
   * @returns {Promise<Object>} Created escrow
   */
  async createEscrow(contractId, milestoneId, amount, options = {}) {
    if (amount <= 0) {
      throw createAppError('Escrow amount must be greater than zero', 400);
    }

    let clientId, freelancerId;

    // For contract-level escrow (contractId is null, milestoneId is 'TOTAL')
    if (!contractId && milestoneId === 'TOTAL') {
      if (!options.clientId || !options.freelancerId) {
        throw createAppError('Client ID and Freelancer ID are required for contract-level escrow', 400);
      }
      clientId = options.clientId;
      freelancerId = options.freelancerId;
    } else if (contractId) {
      // Get contract to verify and get parties
      const contract = await Contract.findById(contractId);
      if (!contract) {
        throw createAppError('Contract not found', 404);
      }

      // Check if milestone exists (unless it's 'TOTAL')
      if (milestoneId !== 'TOTAL') {
        const milestone = contract.milestones.id(milestoneId);
        if (!milestone) {
          throw createAppError('Milestone not found', 404);
        }

        // Check if escrow already exists for this milestone
        const existingEscrow = await Escrow.getByMilestone(contractId, milestoneId);
        if (existingEscrow) {
          throw createAppError('Escrow already exists for this milestone', 400);
        }
      }

      clientId = contract.client;
      freelancerId = contract.freelancer;
    } else {
      throw createAppError('Contract ID is required for milestone escrow', 400);
    }

    // Create escrow
    const escrow = await Escrow.create({
      contractId: contractId || null,
      milestoneId,
      clientId,
      freelancerId,
      amount,
      status: ESCROW_STATUS.CREATED,
    });

    return escrow;
  }

  /**
   * Fund escrow (lock client funds)
   * @param {string} escrowId - Escrow ID
   * @param {Object} paymentData - Payment data
   * @returns {Promise<Object>} Funded escrow
   */
  async fundEscrow(escrowId, paymentData) {
    const { transactionId, paymentMethod, gatewayTransactionId } = paymentData;

    const escrow = await Escrow.findById(escrowId);
    if (!escrow) {
      throw createAppError('Escrow not found', 404);
    }

    if (escrow.status !== ESCROW_STATUS.CREATED) {
      throw createAppError(`Cannot fund escrow in ${escrow.status} status`, 400);
    }

    // Transfer funds from client wallet to escrow
    await walletService.transferToEscrow(
      escrow.clientId,
      escrow.amount,
      escrowId
    );

    // Update escrow status - fund() already saves, so set gatewayTransactionId first
    escrow.gatewayTransactionId = gatewayTransactionId;
    await escrow.fund(transactionId, paymentMethod);

    // Lock the escrow
    await escrow.lock();

    return escrow;
  }

  /**
   * Release escrow to freelancer
   * @param {string} escrowId - Escrow ID
   * @param {string} userId - User ID (must be client)
   * @returns {Promise<Object>} Released escrow
   */
  async releaseEscrow(escrowId, userId) {
    const escrow = await Escrow.findById(escrowId);
    if (!escrow) {
      throw createAppError('Escrow not found', 404);
    }

    // Verify user is the client
    if (escrow.clientId.toString() !== userId.toString()) {
      throw createAppError('Only the client can release escrow', 403);
    }

    // Check if escrow can be released
    if (!canReleaseEscrow(escrow.status)) {
      throw createAppError(`Cannot release escrow in ${escrow.status} status`, 400);
    }

    // Verify milestone is completed
    const contract = await Contract.findById(escrow.contractId);
    if (!contract) {
      throw createAppError('Contract not found', 404);
    }

    const milestone = contract.milestones.id(escrow.milestoneId);
    if (!milestone) {
      throw createAppError('Milestone not found', 404);
    }

    if (milestone.status !== 'completed') {
      throw createAppError('Milestone must be completed before releasing escrow', 400);
    }

    // Release funds to freelancer wallet
    await walletService.releaseFromEscrow(
      escrowId,
      escrow.freelancerId,
      escrow.amount
    );

    // Update escrow status
    await escrow.release();
    await escrow.save();

    return escrow;
  }

  /**
   * Refund escrow to client
   * @param {string} escrowId - Escrow ID
   * @param {string} reason - Refund reason
   * @param {string} userId - User ID (admin or client)
   * @returns {Promise<Object>} Refunded escrow
   */
  async refundEscrow(escrowId, reason, userId) {
    const escrow = await Escrow.findById(escrowId);
    if (!escrow) {
      throw createAppError('Escrow not found', 404);
    }

    // Check if escrow can be refunded
    if (!canRefundEscrow(escrow.status)) {
      throw createAppError(`Cannot refund escrow in ${escrow.status} status`, 400);
    }

    // Verify user is client or admin (admin check should be done in controller)
    const User = (await import('../../models/User.js')).default;
    const user = await User.findById(userId);
    const isAdmin = user && user.role === 'admin';

    if (
      !isAdmin &&
      escrow.clientId.toString() !== userId.toString()
    ) {
      throw createAppError('Only the client or admin can refund escrow', 403);
    }

    // Refund funds to client wallet
    await walletService.refundEscrow(escrowId, escrow.amount);

    // Update escrow status
    await escrow.refund(reason);
    await escrow.save();

    return escrow;
  }

  /**
   * Freeze escrow (for disputes)
   * @param {string} escrowId - Escrow ID
   * @returns {Promise<Object>} Frozen escrow
   */
  async freezeEscrow(escrowId) {
    const escrow = await Escrow.findById(escrowId);
    if (!escrow) {
      throw createAppError('Escrow not found', 404);
    }

    // Check if escrow can be frozen
    if (!canFreezeEscrow(escrow.status)) {
      throw createAppError(`Cannot freeze escrow in ${escrow.status} status`, 400);
    }

    // Freeze the escrow
    await escrow.freeze();
    await escrow.save();

    return escrow;
  }

  /**
   * Get escrows by contract
   * @param {string} contractId - Contract ID
   * @returns {Promise<Array>} Array of escrows
   */
  async getEscrowByContract(contractId) {
    return Escrow.getByContract(contractId);
  }

  /**
   * Get escrow by milestone
   * @param {string} contractId - Contract ID
   * @param {string} milestoneId - Milestone ID
   * @returns {Promise<Object>} Escrow object
   */
  async getEscrowByMilestone(contractId, milestoneId) {
    return Escrow.getByMilestone(contractId, milestoneId);
  }

  /**
   * Get escrow by ID
   * @param {string} escrowId - Escrow ID
   * @returns {Promise<Object>} Escrow object
   */
  async getEscrowById(escrowId) {
    const escrow = await Escrow.findById(escrowId)
      .populate('client', 'name email')
      .populate('freelancer', 'name email')
      .populate('contract', 'title status');
    if (!escrow) {
      throw createAppError('Escrow not found', 404);
    }
    return escrow;
  }

  /**
   * Admin: Manual escrow release (override)
   * @param {string} escrowId - Escrow ID
   * @param {string} adminId - Admin user ID
   * @param {Object} options - Release options
   * @returns {Promise<Object>} Released escrow
   */
  async adminReleaseEscrow(escrowId, adminId, options = {}) {
    const { partialAmount, toUserId } = options;
    const escrow = await Escrow.findById(escrowId);
    if (!escrow) {
      throw createAppError('Escrow not found', 404);
    }

    const amount = partialAmount || escrow.amount;
    const recipientId = toUserId || escrow.freelancerId;

    // Release funds
    await walletService.releaseFromEscrow(escrowId, recipientId, amount);

    // Update escrow
    if (partialAmount && partialAmount < escrow.amount) {
      // Partial release - update amount
      escrow.amount -= partialAmount;
      escrow.metadata = escrow.metadata || new Map();
      escrow.metadata.set('partialRelease', {
        amount: partialAmount,
        releasedAt: new Date(),
        releasedBy: adminId,
      });
    } else {
      // Full release
      await escrow.release();
    }
    await escrow.save();

    return escrow;
  }

  /**
   * Admin: Manual escrow refund (override)
   * @param {string} escrowId - Escrow ID
   * @param {string} adminId - Admin user ID
   * @param {string} reason - Refund reason
   * @returns {Promise<Object>} Refunded escrow
   */
  async adminRefundEscrow(escrowId, adminId, reason) {
    return this.refundEscrow(escrowId, reason, adminId);
  }
}

export default new EscrowService();

