import mongoose from 'mongoose';
import Wallet from '../../models/Wallet.js';
import Transaction from '../../models/Transaction.js';
import PlatformWallet from '../../models/PlatformWallet.js';
import { createAppError } from '../../core/errors/index.js';
import { 
  TRANSACTION_TYPE, 
  TRANSACTION_STATUS,
  PAYMENT_LIMITS,
} from './payment.constants.js';
import {
  calculatePlatformFee,
  calculateFreelancerAmount,
  generateIdempotencyKey,
  PLATFORM_FEE,
} from '../../config/payment.config.js';

/**
 * Wallet Service
 * 
 * Handles wallet operations with proper MongoDB transactions
 * for atomicity and data consistency.
 * 
 * Key features:
 * - MongoDB transactions for atomic operations
 * - Optimistic locking via version field
 * - Idempotency support for safe retries
 * - Platform fee deduction on escrow release
 */
class WalletService {
  /**
   * Get or create wallet for user
   * @param {string} userId - User ID
   * @param {Object} session - MongoDB session (optional)
   * @returns {Promise<Object>} Wallet object
   */
  async getWallet(userId, session = null) {
    try {
      const wallet = await Wallet.getOrCreateWallet(userId, session);
      return wallet;
    } catch (error) {
      throw createAppError(`Failed to get wallet: ${error.message}`, 500);
    }
  }

  /**
   * Credit wallet with transaction support
   * Used for deposits and refunds
   * 
   * @param {string} userId - User ID
   * @param {number} amount - Amount to credit
   * @param {Object} options - Options
   * @param {string} options.transactionId - Gateway transaction ID
   * @param {string} options.idempotencyKey - Idempotency key
   * @param {string} options.description - Description
   * @param {string} options.type - Transaction type
   * @param {string} options.ipAddress - Client IP
   * @returns {Promise<Object>} { wallet, transaction }
   */
  async creditWallet(userId, amount, options = {}) {
    if (amount <= 0) {
      throw createAppError('Amount must be greater than zero', 400);
    }

    const {
      transactionId = null,
      idempotencyKey = generateIdempotencyKey('DEP'),
      description = `Wallet deposit: PKR ${amount}`,
      type = TRANSACTION_TYPE.DEPOSIT,
      ipAddress = null,
      paymentMethod = 'WALLET',
    } = options;

    // Check for existing transaction with this idempotency key
    const existingTxn = await Transaction.findByIdempotencyKey(idempotencyKey);
    if (existingTxn) {
      const wallet = await this.getWallet(userId);
      return { wallet, transaction: existingTxn, isExisting: true };
    }

    // Start a MongoDB session for transaction
    const session = await mongoose.startSession();
    
    try {
      let wallet, transaction;
      
      await session.withTransaction(async () => {
        // Get current balance before update
        const currentWallet = await Wallet.findOne({ userId }).session(session);
        const balanceBefore = currentWallet?.availableBalance || 0;

        // Atomic credit
        wallet = await Wallet.atomicRecordDeposit(userId, amount, session);

        // Create transaction record
        [transaction] = await Transaction.create([{
          idempotencyKey,
          userId,
          type,
          direction: 'CREDIT',
          amount,
          netAmount: amount,
          currency: 'PKR',
          status: TRANSACTION_STATUS.SUCCESS,
          paymentMethod,
          gatewayTransactionId: transactionId,
          description,
          ipAddress,
          balanceBefore,
          balanceAfter: wallet.availableBalance,
          completedAt: new Date(),
        }], { session });
      });

      return { wallet, transaction, isExisting: false };
    } catch (error) {
      throw createAppError(`Credit wallet failed: ${error.message}`, 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Credit wallet balance for an already-recorded external deposit.
   * This updates wallet totals without creating a second Transaction row.
   */
  async creditExistingDeposit(userId, amount, session = null) {
    if (amount <= 0) {
      throw createAppError('Amount must be greater than zero', 400);
    }

    try {
      return Wallet.atomicRecordDeposit(userId, amount, session);
    } catch (error) {
      throw createAppError(`Credit wallet failed: ${error.message}`, 500);
    }
  }

  /**
   * Debit wallet with transaction support
   * Used for withdrawals
   * 
   * @param {string} userId - User ID
   * @param {number} amount - Amount to debit
   * @param {Object} options - Options
   * @returns {Promise<Object>} { wallet, transaction }
   */
  async debitWallet(userId, amount, options = {}) {
    if (amount <= 0) {
      throw createAppError('Amount must be greater than zero', 400);
    }

    const {
      transactionId = null,
      idempotencyKey = generateIdempotencyKey('WDR'),
      description = `Wallet withdrawal: PKR ${amount}`,
      type = TRANSACTION_TYPE.WITHDRAWAL,
      ipAddress = null,
      paymentMethod = 'WALLET',
      withdrawalRequestId = null,
    } = options;

    // Check for existing transaction with this idempotency key
    const existingTxn = await Transaction.findByIdempotencyKey(idempotencyKey);
    if (existingTxn) {
      const wallet = await this.getWallet(userId);
      return { wallet, transaction: existingTxn, isExisting: true };
    }

    const session = await mongoose.startSession();
    
    try {
      let wallet, transaction;

      await session.withTransaction(async () => {
        // Get current balance before update
        const currentWallet = await Wallet.findOne({ userId }).session(session);
        const balanceBefore = currentWallet?.availableBalance || 0;

        // Atomic debit (includes balance check)
        wallet = await Wallet.atomicDebit(userId, amount, session);

        // Record total withdrawn
        await Wallet.atomicRecordWithdrawal(userId, amount, session);

        // Create transaction record
        [transaction] = await Transaction.create([{
          idempotencyKey,
          userId,
          type,
          direction: 'DEBIT',
          amount,
          netAmount: amount,
          currency: 'PKR',
          status: TRANSACTION_STATUS.SUCCESS,
          paymentMethod,
          gatewayTransactionId: transactionId,
          withdrawalRequestId,
          description,
          ipAddress,
          balanceBefore,
          balanceAfter: wallet.availableBalance,
          completedAt: new Date(),
        }], { session });
      });

      return { wallet, transaction, isExisting: false };
    } catch (error) {
      if (error.message.includes('Insufficient balance')) {
        throw createAppError('Insufficient available balance', 400);
      }
      throw createAppError(`Debit wallet failed: ${error.message}`, 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Lock funds in wallet (for escrow)
   * Moves amount from available to locked balance
   * 
   * @param {string} userId - User ID
   * @param {number} amount - Amount to lock
   * @param {string} escrowId - Associated escrow ID
   * @returns {Promise<Object>} { wallet, transaction }
   */
  async lockFunds(userId, amount, escrowId = null) {
    if (amount <= 0) {
      throw createAppError('Amount must be greater than zero', 400);
    }

    const session = await mongoose.startSession();
    
    try {
      let wallet, transaction;

      await session.withTransaction(async () => {
        // Get current balances
        const currentWallet = await Wallet.findOne({ userId }).session(session);
        const balanceBefore = currentWallet?.availableBalance || 0;

        // Atomic lock
        wallet = await Wallet.atomicLockFunds(userId, amount, session);

        // Create transaction record
        [transaction] = await Transaction.create([{
          idempotencyKey: generateIdempotencyKey('LCK'),
          userId,
          type: TRANSACTION_TYPE.ESCROW_FUND,
          direction: 'DEBIT',
          amount,
          netAmount: amount,
          currency: 'PKR',
          status: TRANSACTION_STATUS.SUCCESS,
          paymentMethod: 'WALLET',
          escrowId,
          description: `Funds locked for escrow: PKR ${amount}`,
          balanceBefore,
          balanceAfter: wallet.availableBalance,
          completedAt: new Date(),
        }], { session });
      });

      return { wallet, transaction };
    } catch (error) {
      if (error.message.includes('Insufficient')) {
        throw createAppError('Insufficient available balance to lock', 400);
      }
      throw createAppError(`Lock funds failed: ${error.message}`, 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Unlock funds (return from locked to available)
   * Used when escrow is cancelled before release
   * 
   * @param {string} userId - User ID
   * @param {number} amount - Amount to unlock
   * @param {string} escrowId - Associated escrow ID
   * @returns {Promise<Object>} { wallet, transaction }
   */
  async unlockFunds(userId, amount, escrowId = null) {
    if (amount <= 0) {
      throw createAppError('Amount must be greater than zero', 400);
    }

    const session = await mongoose.startSession();
    
    try {
      let wallet, transaction;

      await session.withTransaction(async () => {
        const currentWallet = await Wallet.findOne({ userId }).session(session);
        const balanceBefore = currentWallet?.availableBalance || 0;

        wallet = await Wallet.atomicUnlockFunds(userId, amount, session);

        [transaction] = await Transaction.create([{
          idempotencyKey: generateIdempotencyKey('ULK'),
          userId,
          type: TRANSACTION_TYPE.REFUND,
          direction: 'CREDIT',
          amount,
          netAmount: amount,
          currency: 'PKR',
          status: TRANSACTION_STATUS.SUCCESS,
          paymentMethod: 'WALLET',
          escrowId,
          description: `Escrow funds unlocked: PKR ${amount}`,
          balanceBefore,
          balanceAfter: wallet.availableBalance,
          completedAt: new Date(),
        }], { session });
      });

      return { wallet, transaction };
    } catch (error) {
      if (error.message.includes('Insufficient')) {
        throw createAppError('Insufficient locked balance to unlock', 400);
      }
      throw createAppError(`Unlock funds failed: ${error.message}`, 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Transfer funds to escrow
   * Locks client funds for escrow payment
   * 
   * @param {string} userId - Client user ID
   * @param {number} amount - Amount to transfer
   * @param {string} escrowId - Escrow ID
   * @returns {Promise<Object>} { wallet, transaction }
   */
  async transferToEscrow(userId, amount, escrowId) {
    return this.lockFunds(userId, amount, escrowId);
  }

  /**
   * Release funds from escrow to freelancer
   * 
   * CRITICAL: This method deducts 5% platform fee!
   * 
   * @param {string} escrowId - Escrow ID
   * @param {string} freelancerId - Freelancer user ID
   * @param {number} grossAmount - Total amount in escrow
   * @param {string} clientId - Client user ID (for deducting locked balance)
   * @returns {Promise<Object>} { freelancerWallet, clientWallet, freelancerTransaction, feeTransaction, platformFee, netAmount }
   */
  async releaseFromEscrow(escrowId, freelancerId, grossAmount, clientId) {
    if (grossAmount <= 0) {
      throw createAppError('Amount must be greater than zero', 400);
    }

    // Calculate platform fee (5%)
    const platformFee = calculatePlatformFee(grossAmount);
    const netAmount = grossAmount - platformFee;

    const session = await mongoose.startSession();
    
    try {
      let freelancerWallet, clientWallet, freelancerTransaction, feeTransaction;

      await session.withTransaction(async () => {
        // 1. Deduct from client's locked balance
        clientWallet = await Wallet.atomicReleaseFromLocked(clientId, grossAmount, session);

        // 2. Get freelancer's current balance
        const currentFreelancerWallet = await Wallet.findOne({ userId: freelancerId }).session(session);
        const balanceBefore = currentFreelancerWallet?.availableBalance || 0;

        // 3. Credit freelancer with net amount (after fee)
        freelancerWallet = await Wallet.atomicCreditEarnings(freelancerId, grossAmount, platformFee, session);

        // 4. Create freelancer receipt transaction
        [freelancerTransaction] = await Transaction.create([{
          idempotencyKey: generateIdempotencyKey('REL'),
          userId: freelancerId,
          counterPartyId: clientId,
          type: TRANSACTION_TYPE.ESCROW_RELEASE,
          direction: 'CREDIT',
          amount: grossAmount,
          platformFee,
          netAmount,
          feePercentage: PLATFORM_FEE.percentage,
          currency: 'PKR',
          status: TRANSACTION_STATUS.SUCCESS,
          paymentMethod: 'WALLET',
          escrowId,
          description: `Payment received: PKR ${netAmount} (after ${PLATFORM_FEE.percentage}% platform fee)`,
          balanceBefore,
          balanceAfter: freelancerWallet.availableBalance,
          completedAt: new Date(),
        }], { session });

        // 5. Record debit on client side
        await Transaction.create([{
          idempotencyKey: generateIdempotencyKey('REL'),
          userId: clientId,
          counterPartyId: freelancerId,
          type: TRANSACTION_TYPE.ESCROW_RELEASE,
          direction: 'DEBIT',
          amount: grossAmount,
          currency: 'PKR',
          status: TRANSACTION_STATUS.SUCCESS,
          paymentMethod: 'WALLET',
          escrowId,
          description: `Payment released to freelancer: PKR ${grossAmount}`,
          completedAt: new Date(),
        }], { session });

        // 6. Credit platform wallet with fee
        if (platformFee > 0) {
          await PlatformWallet.addFee(platformFee, session);

          // 7. Create platform fee transaction
          [feeTransaction] = await Transaction.create([{
            idempotencyKey: generateIdempotencyKey('FEE'),
            userId: freelancerId,
            type: 'PLATFORM_FEE',
            direction: 'DEBIT',
            amount: platformFee,
            netAmount: platformFee,
            feePercentage: PLATFORM_FEE.percentage,
            currency: 'PKR',
            status: TRANSACTION_STATUS.SUCCESS,
            paymentMethod: 'SYSTEM',
            escrowId,
            description: `Platform fee (${PLATFORM_FEE.percentage}%): PKR ${platformFee}`,
            completedAt: new Date(),
          }], { session });
        }
      });

      return {
        freelancerWallet,
        clientWallet,
        freelancerTransaction,
        feeTransaction,
        platformFee,
        netAmount,
        grossAmount,
      };
    } catch (error) {
      console.error('Escrow release error:', error);
      throw createAppError(`Release escrow failed: ${error.message}`, 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Refund escrow funds to client
   * Full refund - no fee deducted
   * 
   * @param {string} escrowId - Escrow ID
   * @param {string} clientId - Client user ID
   * @param {number} amount - Amount to refund
   * @param {string} reason - Refund reason
   * @returns {Promise<Object>} { wallet, transaction }
   */
  async refundEscrow(escrowId, clientId, amount, reason = '') {
    if (amount <= 0) {
      throw createAppError('Amount must be greater than zero', 400);
    }

    const session = await mongoose.startSession();
    
    try {
      let wallet, transaction;

      await session.withTransaction(async () => {
        // Get current client wallet
        const currentWallet = await Wallet.findOne({ userId: clientId }).session(session);
        const balanceBefore = currentWallet?.availableBalance || 0;

        // Check locked balance
        if ((currentWallet?.lockedBalance || 0) < amount) {
          throw createAppError('Insufficient locked balance for refund', 400);
        }

        // Unlock funds back to available
        await Wallet.atomicUnlockFunds(clientId, amount, session);
        
        // Get updated wallet
        wallet = await Wallet.findOne({ userId: clientId }).session(session);

        // Create refund transaction
        [transaction] = await Transaction.create([{
          idempotencyKey: generateIdempotencyKey('RFD'),
          userId: clientId,
          type: TRANSACTION_TYPE.ESCROW_REFUND,
          direction: 'CREDIT',
          amount,
          netAmount: amount,
          currency: 'PKR',
          status: TRANSACTION_STATUS.SUCCESS,
          paymentMethod: 'WALLET',
          escrowId,
          description: reason ? `Escrow refund: ${reason}` : `Escrow refund: PKR ${amount}`,
          balanceBefore,
          balanceAfter: wallet.availableBalance,
          completedAt: new Date(),
        }], { session });
      });

      return { wallet, transaction };
    } catch (error) {
      if (error.message.includes('Insufficient')) {
        throw createAppError(error.message, 400);
      }
      throw createAppError(`Refund escrow failed: ${error.message}`, 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Get wallet balance summary
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Wallet balance summary
   */
  async getBalanceSummary(userId) {
    const wallet = await Wallet.getOrCreateWallet(userId);
    return {
      availableBalance: wallet.availableBalance,
      lockedBalance: wallet.lockedBalance,
      pendingBalance: wallet.pendingBalance || 0,
      totalBalance: wallet.totalBalance,
      totalEarned: wallet.totalEarned,
      totalWithdrawn: wallet.totalWithdrawn,
      totalFeesPaid: wallet.totalFeesPaid || 0,
      totalDeposited: wallet.totalDeposited || 0,
      currency: wallet.currency,
      status: wallet.status,
      lastTransactionAt: wallet.lastTransactionAt,
    };
  }

  /**
   * Get user transaction history with pagination
   * @param {string} userId - User ID
   * @param {Object} options - Pagination options
   * @returns {Promise<Object>} { transactions, pagination }
   */
  async getTransactionHistory(userId, options = {}) {
    const { page = 1, limit = 20, type = null, status = null } = options;
    
    const filters = {};
    if (type) filters.type = type;
    if (status) filters.status = status;

    return Transaction.getUserTransactions(userId, filters, { page, limit });
  }

  /**
   * Get platform revenue statistics
   * @returns {Promise<Object>} Revenue stats
   */
  async getPlatformRevenueStats() {
    return PlatformWallet.getRevenueStats();
  }
}

export default new WalletService();
