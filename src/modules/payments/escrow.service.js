import mongoose from 'mongoose';
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
import {
  calculatePlatformFee,
  calculateFreelancerAmount,
  PLATFORM_FEE,
  ESCROW_CONFIG,
} from '../../config/payment.config.js';

/**
 * Escrow Service
 * 
 * Handles escrow creation, funding, release, refund, and freezing.
 * 
 * Key features:
 * - Platform fee calculation (5%) on release
 * - Atomic transactions for fund movements
 * - Expiry handling for unfunded escrows
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

    // Calculate platform fee upfront (for transparency)
    const platformFee = calculatePlatformFee(amount);
    const freelancerAmount = amount - platformFee;

    // Set expiry for unfunded escrows
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + ESCROW_CONFIG.expiryDaysUnfunded);

    // Create escrow with fee breakdown
    const escrow = await Escrow.create({
      contractId: contractId || null,
      milestoneId,
      clientId,
      freelancerId,
      amount,
      platformFee,
      feePercentage: PLATFORM_FEE.percentage,
      freelancerAmount,
      currency: 'PKR',
      status: ESCROW_STATUS.CREATED,
      expiresAt,
    });

    return escrow;
  }

  /**
   * Fund escrow (lock client funds)
   * @param {string} escrowId - Escrow ID
   * @param {Object} paymentData - Payment data
   * @returns {Promise<Object>} Funded escrow
   */
  async fundEscrow(escrowId, paymentData = {}) {
    const { transactionId, paymentMethod = 'WALLET', gatewayTransactionId } = paymentData;

    const escrow = await Escrow.findById(escrowId);
    if (!escrow) {
      throw createAppError('Escrow not found', 404);
    }

    if (escrow.status !== ESCROW_STATUS.CREATED) {
      throw createAppError(`Cannot fund escrow in ${escrow.status} status`, 400);
    }

    // Check if escrow has expired
    if (escrow.expiresAt && escrow.expiresAt < new Date()) {
      escrow.status = 'EXPIRED';
      await escrow.save();
      throw createAppError('Escrow has expired', 400);
    }

    // Transfer funds from client wallet to escrow (locks the funds)
    const { transaction } = await walletService.transferToEscrow(
      escrow.clientId,
      escrow.amount,
      escrowId
    );

    // Update escrow status
    escrow.gatewayTransactionId = gatewayTransactionId;
    await escrow.fund(transaction._id, paymentMethod);

    // Lock the escrow (marks work can begin)
    await escrow.lock();

    return escrow;
  }

  /**
   * Release escrow to freelancer
   * 
   * IMPORTANT: Deducts 5% platform fee!
   * 
   * @param {string} escrowId - Escrow ID
   * @param {string} userId - User ID (must be client)
   * @param {Object} options - Release options
   * @returns {Promise<Object>} { escrow, paymentDetails }
   */
  async releaseEscrow(escrowId, userId, options = {}) {
    const { notes = '' } = options;

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

    // Verify milestone is in valid state for release (for milestone-based escrows)
    if (escrow.contractId && escrow.milestoneId !== 'TOTAL') {
      const contract = await Contract.findById(escrow.contractId);
      if (!contract) {
        throw createAppError('Contract not found', 404);
      }

      const milestone = contract.milestones.id(escrow.milestoneId);
      if (!milestone) {
        throw createAppError('Milestone not found', 404);
      }

      // Allow release when milestone is in_review (being approved) or already completed
      if (milestone.status !== 'in_review' && milestone.status !== 'completed') {
        throw createAppError(`Milestone must be in review or completed before releasing escrow. Current status: ${milestone.status}`, 400);
      }
    }

    // Release funds to freelancer wallet (with 5% fee deduction!)
    const paymentResult = await walletService.releaseFromEscrow(
      escrowId,
      escrow.freelancerId,
      escrow.amount,
      escrow.clientId
    );

    // Update escrow status with transaction references
    await escrow.release(
      paymentResult.freelancerTransaction._id,
      paymentResult.feeTransaction?._id,
      notes
    );

    return {
      escrow,
      paymentDetails: {
        grossAmount: paymentResult.grossAmount,
        platformFee: paymentResult.platformFee,
        netAmount: paymentResult.netAmount,
        feePercentage: PLATFORM_FEE.percentage,
        freelancerWallet: paymentResult.freelancerWallet,
      },
    };
  }

  /**
   * Refund escrow to client
   * Full refund - no platform fee
   * 
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

    // Verify user is client or admin
    const User = (await import('../../models/User.js')).default;
    const user = await User.findById(userId);
    const isAdmin = user && user.role === 'admin';

    if (
      !isAdmin &&
      escrow.clientId.toString() !== userId.toString()
    ) {
      throw createAppError('Only the client or admin can refund escrow', 403);
    }

    // Refund funds to client wallet (full amount, no fee)
    const { transaction } = await walletService.refundEscrow(
      escrowId,
      escrow.clientId,
      escrow.amount,
      reason
    );

    // Update escrow status
    await escrow.refund(transaction._id, reason);

    return escrow;
  }

  /**
   * Freeze escrow (for disputes)
   * @param {string} escrowId - Escrow ID
   * @param {string} reason - Dispute reason
   * @returns {Promise<Object>} Frozen escrow
   */
  async freezeEscrow(escrowId, reason = '') {
    const escrow = await Escrow.findById(escrowId);
    if (!escrow) {
      throw createAppError('Escrow not found', 404);
    }

    // Check if escrow can be frozen
    if (!canFreezeEscrow(escrow.status)) {
      throw createAppError(`Cannot freeze escrow in ${escrow.status} status`, 400);
    }

    // Freeze the escrow
    await escrow.freeze(reason);

    return escrow;
  }

  /**
   * Get escrows by contract
   * @param {string} contractId - Contract ID
   * @returns {Promise<Array>} Array of escrows
   */
  async getEscrowByContract(contractId) {
    // When admins view escrows by contract we still want to see user names, so
    // populate the same fields as getAllEscrows. this mirrors the query but without
    // pagination.
    return Escrow.find({ contractId })
      .populate('client', 'name email')
      .populate('freelancer', 'name email')
      .populate('contract', 'title')
      .sort({ createdAt: -1 });
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
   * Get escrow summary (with fee breakdown)
   * @param {string} escrowId - Escrow ID
   * @returns {Promise<Object>} Escrow with payment details
   */
  async getEscrowSummary(escrowId) {
    const escrow = await this.getEscrowById(escrowId);
    
    return {
      ...escrow.toObject(),
      feeBreakdown: {
        totalAmount: escrow.amount,
        platformFee: escrow.platformFee || calculatePlatformFee(escrow.amount),
        freelancerAmount: escrow.freelancerAmount || calculateFreelancerAmount(escrow.amount),
        feePercentage: escrow.feePercentage || PLATFORM_FEE.percentage,
      },
    };
  }

  /**
   * Admin: Manual escrow release (override)
   * Used for dispute resolution or manual intervention
   * 
   * @param {string} escrowId - Escrow ID
   * @param {string} adminId - Admin user ID
   * @param {Object} options - Release options
   * @returns {Promise<Object>} { escrow, paymentDetails }
   */
  async adminReleaseEscrow(escrowId, adminId, options = {}) {
    const { partialAmount, toUserId, notes = '' } = options;
    
    const escrow = await Escrow.findById(escrowId);
    if (!escrow) {
      throw createAppError('Escrow not found', 404);
    }

    const amount = partialAmount || escrow.amount;
    const recipientId = toUserId || escrow.freelancerId;

    // Validate partial amount
    if (partialAmount && partialAmount > escrow.amount) {
      throw createAppError('Partial amount cannot exceed escrow amount', 400);
    }

    // Release funds with fee deduction
    const paymentResult = await walletService.releaseFromEscrow(
      escrowId,
      recipientId,
      amount,
      escrow.clientId
    );

    // Update escrow
    if (partialAmount && partialAmount < escrow.amount) {
      // Partial release - update remaining amount
      const remainingAmount = escrow.amount - partialAmount;
      const remainingFee = calculatePlatformFee(remainingAmount);
      
      escrow.amount = remainingAmount;
      escrow.platformFee = remainingFee;
      escrow.freelancerAmount = remainingAmount - remainingFee;
      escrow.metadata = escrow.metadata || new Map();
      escrow.metadata.set('partialRelease', {
        amount: partialAmount,
        netAmount: paymentResult.netAmount,
        platformFee: paymentResult.platformFee,
        releasedAt: new Date(),
        releasedBy: adminId,
        recipientId,
      });
      await escrow.save();
    } else {
      // Full release
      await escrow.release(
        paymentResult.freelancerTransaction._id,
        paymentResult.feeTransaction?._id,
        notes || `Admin release by ${adminId}`
      );
    }

    return {
      escrow,
      paymentDetails: {
        grossAmount: paymentResult.grossAmount,
        platformFee: paymentResult.platformFee,
        netAmount: paymentResult.netAmount,
        feePercentage: PLATFORM_FEE.percentage,
      },
    };
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

  /**
   * Admin: Resolve dispute
   * @param {string} escrowId - Escrow ID
   * @param {string} adminId - Admin user ID
   * @param {string} resolution - 'RELEASE_TO_FREELANCER', 'REFUND_TO_CLIENT', or 'SPLIT'
   * @param {Object} options - Split options if resolution is 'SPLIT'
   * @returns {Promise<Object>} Resolved escrow
   */
  async resolveDispute(escrowId, adminId, resolution, options = {}) {
    const escrow = await Escrow.findById(escrowId);
    if (!escrow) {
      throw createAppError('Escrow not found', 404);
    }

    if (escrow.status !== 'DISPUTED') {
      throw createAppError('Escrow is not in disputed status', 400);
    }

    let result;

    switch (resolution) {
      case 'RELEASE_TO_FREELANCER':
        result = await this.adminReleaseEscrow(escrowId, adminId, {
          notes: `Dispute resolved in favor of freelancer`,
        });
        break;

      case 'REFUND_TO_CLIENT':
        result = await this.adminRefundEscrow(escrowId, adminId, 'Dispute resolved in favor of client');
        break;

      case 'SPLIT':
        const { freelancerPercentage = 50 } = options;
        const freelancerAmount = Math.round((escrow.amount * freelancerPercentage) / 100);
        const clientAmount = escrow.amount - freelancerAmount;

        // Release partial to freelancer
        await this.adminReleaseEscrow(escrowId, adminId, {
          partialAmount: freelancerAmount,
          notes: `Dispute split: ${freelancerPercentage}% to freelancer`,
        });

        // Refund rest to client
        if (clientAmount > 0) {
          await walletService.refundEscrow(
            escrowId,
            escrow.clientId,
            clientAmount,
            `Dispute split: ${100 - freelancerPercentage}% refunded to client`
          );
        }

        result = await Escrow.findById(escrowId);
        break;

      default:
        throw createAppError('Invalid resolution type', 400);
    }

    // Update dispute resolution
    await escrow.resolveDispute(resolution, adminId);

    return result;
  }

  /**
   * Get all escrows for admin dashboard
   * @param {Object} filters - Filter options
   * @param {Object} pagination - Pagination options
   * @returns {Promise<Object>} { escrows, pagination }
   */
  async getAllEscrows(filters = {}, pagination = {}) {
    const { status, clientId, freelancerId, minAmount, maxAmount } = filters;
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    const query = {};
    if (status) query.status = status;
    if (clientId) query.clientId = clientId;
    if (freelancerId) query.freelancerId = freelancerId;
    if (minAmount || maxAmount) {
      query.amount = {};
      if (minAmount) query.amount.$gte = minAmount;
      if (maxAmount) query.amount.$lte = maxAmount;
    }

    const [escrows, total] = await Promise.all([
      Escrow.find(query)
        // previous code populated firstName/lastName but User model now uses a single
        // `name` field. include both name and email so clients show properly in the
        // admin UI. keeping email for debugging/links if needed.
        .populate('client', 'name email')
        .populate('freelancer', 'name email')
        .populate('contract', 'title')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Escrow.countDocuments(query),
    ]);

    return {
      escrows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get escrow statistics for admin dashboard
   * @returns {Promise<Object>} Escrow statistics
   */
  async getEscrowStats() {
    const stats = await Escrow.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          totalFees: { $sum: '$platformFee' },
        },
      },
    ]);

    const totalLocked = await Escrow.aggregate([
      {
        $match: { status: { $in: ['FUNDED', 'LOCKED', 'DISPUTED'] } },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
        },
      },
    ]);

    return {
      byStatus: stats.reduce((acc, s) => {
        acc[s._id] = { count: s.count, totalAmount: s.totalAmount, totalFees: s.totalFees };
        return acc;
      }, {}),
      totalLockedInEscrow: totalLocked[0]?.total || 0,
    };
  }
}

export default new EscrowService();

