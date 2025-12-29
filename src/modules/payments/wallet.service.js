import Wallet from '../../models/Wallet.js';
import Transaction from '../../models/Transaction.js';
import { createAppError } from '../../core/errors/index.js';
import { TRANSACTION_TYPE, TRANSACTION_STATUS } from './payment.constants.js';

/**
 * Wallet Service
 * Handles wallet operations: balance management, locking/unlocking funds, transfers
 */
class WalletService {
  /**
   * Get or create wallet for user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Wallet object
   */
  async getWallet(userId) {
    try {
      const wallet = await Wallet.getOrCreateWallet(userId);
      return wallet;
    } catch (error) {
      throw createAppError(`Failed to get wallet: ${error.message}`, 500);
    }
  }

  /**
   * Credit wallet (add funds)
   * @param {string} userId - User ID
   * @param {number} amount - Amount to credit
   * @param {string} transactionId - Transaction ID
   * @returns {Promise<Object>} Updated wallet
   */
  async creditWallet(userId, amount, transactionId) {
    if (amount <= 0) {
      throw createAppError('Amount must be greater than zero', 400);
    }

    const wallet = await Wallet.getOrCreateWallet(userId);
    wallet.availableBalance += amount;
    wallet.totalEarned += amount;

    await wallet.save();

    // Create transaction record
    await Transaction.create({
      userId,
      type: TRANSACTION_TYPE.DEPOSIT,
      amount,
      status: TRANSACTION_STATUS.SUCCESS,
      gatewayTransactionId: transactionId,
      description: `Wallet deposit: PKR ${amount}`,
    });

    return wallet;
  }

  /**
   * Debit wallet (remove funds)
   * @param {string} userId - User ID
   * @param {number} amount - Amount to debit
   * @param {string} transactionId - Transaction ID
   * @param {string} description - Transaction description
   * @returns {Promise<Object>} Updated wallet
   */
  async debitWallet(userId, amount, transactionId, description = '') {
    if (amount <= 0) {
      throw createAppError('Amount must be greater than zero', 400);
    }

    const wallet = await Wallet.getOrCreateWallet(userId);

    if (!wallet.hasSufficientBalance(amount)) {
      throw createAppError('Insufficient available balance', 400);
    }

    wallet.availableBalance -= amount;

    await wallet.save();

    // Create transaction record
    await Transaction.create({
      userId,
      type: TRANSACTION_TYPE.WITHDRAWAL,
      amount,
      status: TRANSACTION_STATUS.SUCCESS,
      gatewayTransactionId: transactionId,
      description: description || `Wallet withdrawal: PKR ${amount}`,
    });

    return wallet;
  }

  /**
   * Lock funds (for escrow)
   * @param {string} userId - User ID
   * @param {number} amount - Amount to lock
   * @returns {Promise<Object>} Updated wallet
   */
  async lockFunds(userId, amount) {
    if (amount <= 0) {
      throw createAppError('Amount must be greater than zero', 400);
    }

    const wallet = await Wallet.getOrCreateWallet(userId);

    if (!wallet.hasSufficientBalance(amount)) {
      throw createAppError('Insufficient available balance to lock', 400);
    }

    wallet.availableBalance -= amount;
    wallet.lockedBalance += amount;

    await wallet.save();
    return wallet;
  }

  /**
   * Unlock funds (from escrow)
   * @param {string} userId - User ID
   * @param {number} amount - Amount to unlock
   * @returns {Promise<Object>} Updated wallet
   */
  async unlockFunds(userId, amount) {
    if (amount <= 0) {
      throw createAppError('Amount must be greater than zero', 400);
    }

    const wallet = await Wallet.getOrCreateWallet(userId);

    if (wallet.lockedBalance < amount) {
      throw createAppError('Insufficient locked balance to unlock', 400);
    }

    wallet.lockedBalance -= amount;
    wallet.availableBalance += amount;

    await wallet.save();
    return wallet;
  }

  /**
   * Transfer funds to escrow
   * @param {string} userId - User ID (client)
   * @param {number} amount - Amount to transfer
   * @param {string} escrowId - Escrow ID
   * @returns {Promise<Object>} Updated wallet
   */
  async transferToEscrow(userId, amount, escrowId) {
    if (amount <= 0) {
      throw createAppError('Amount must be greater than zero', 400);
    }

    const wallet = await Wallet.getOrCreateWallet(userId);

    if (!wallet.hasSufficientBalance(amount)) {
      throw createAppError('Insufficient available balance', 400);
    }

    // Lock the funds
    wallet.availableBalance -= amount;
    wallet.lockedBalance += amount;

    await wallet.save();

    // Create transaction record
    await Transaction.create({
      userId,
      type: TRANSACTION_TYPE.ESCROW_FUND,
      amount,
      status: TRANSACTION_STATUS.SUCCESS,
      escrowId,
      description: `Funds locked in escrow: PKR ${amount}`,
    });

    return wallet;
  }

  /**
   * Release funds from escrow to freelancer
   * @param {string} escrowId - Escrow ID
   * @param {string} freelancerId - Freelancer user ID
   * @param {number} amount - Amount to release
   * @returns {Promise<Object>} Updated freelancer wallet
   */
  async releaseFromEscrow(escrowId, freelancerId, amount) {
    if (amount <= 0) {
      throw createAppError('Amount must be greater than zero', 400);
    }

    // Get escrow to find client
    const Escrow = (await import('../../models/Escrow.js')).default;
    const escrow = await Escrow.findById(escrowId);
    if (!escrow) {
      throw createAppError('Escrow not found', 404);
    }

    const clientId = escrow.clientId;

    // Unlock funds from client wallet
    const clientWallet = await Wallet.getOrCreateWallet(clientId);
    if (clientWallet.lockedBalance < amount) {
      throw createAppError('Insufficient locked balance in client wallet', 400);
    }

    clientWallet.lockedBalance -= amount;
    await clientWallet.save();

    // Credit freelancer wallet
    const freelancerWallet = await Wallet.getOrCreateWallet(freelancerId);
    freelancerWallet.availableBalance += amount;
    freelancerWallet.totalEarned += amount;
    await freelancerWallet.save();

    // Create transaction records
    await Transaction.create({
      userId: clientId,
      type: TRANSACTION_TYPE.ESCROW_RELEASE,
      amount,
      status: TRANSACTION_STATUS.SUCCESS,
      escrowId,
      description: `Escrow released to freelancer: PKR ${amount}`,
    });

    await Transaction.create({
      userId: freelancerId,
      type: TRANSACTION_TYPE.ESCROW_RELEASE,
      amount,
      status: TRANSACTION_STATUS.SUCCESS,
      escrowId,
      description: `Escrow payment received: PKR ${amount}`,
    });

    return freelancerWallet;
  }

  /**
   * Refund escrow funds to client
   * @param {string} escrowId - Escrow ID
   * @param {number} amount - Amount to refund
   * @returns {Promise<Object>} Updated client wallet
   */
  async refundEscrow(escrowId, amount) {
    if (amount <= 0) {
      throw createAppError('Amount must be greater than zero', 400);
    }

    // Get escrow to find client
    const Escrow = (await import('../../models/Escrow.js')).default;
    const escrow = await Escrow.findById(escrowId);
    if (!escrow) {
      throw createAppError('Escrow not found', 404);
    }

    const clientId = escrow.clientId;

    // Unlock funds from client wallet
    const clientWallet = await Wallet.getOrCreateWallet(clientId);
    if (clientWallet.lockedBalance < amount) {
      throw createAppError('Insufficient locked balance in client wallet', 400);
    }

    // Refund: unlock and add back to available
    clientWallet.lockedBalance -= amount;
    clientWallet.availableBalance += amount;
    await clientWallet.save();

    // Create transaction record
    await Transaction.create({
      userId: clientId,
      type: TRANSACTION_TYPE.REFUND,
      amount,
      status: TRANSACTION_STATUS.SUCCESS,
      escrowId,
      description: `Escrow refund: PKR ${amount}`,
    });

    return clientWallet;
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
      totalBalance: wallet.totalBalance,
      totalEarned: wallet.totalEarned,
      totalWithdrawn: wallet.totalWithdrawn,
      currency: wallet.currency,
    };
  }
}

export default new WalletService();

