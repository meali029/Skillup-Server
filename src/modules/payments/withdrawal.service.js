import WithdrawalRequest from '../../models/WithdrawalRequest.js';
import walletService from './wallet.service.js';
import Transaction from '../../models/Transaction.js';
import { createAppError } from '../../core/errors/index.js';
import { encrypt, decrypt } from '../../core/utils/encryption.js';
import {
  PAYMENT_METHOD,
  WITHDRAWAL_STATUS,
  TRANSACTION_TYPE,
  TRANSACTION_STATUS,
  PAYMENT_LIMITS,
  isValidWithdrawalAmount,
} from './payment.constants.js';
import jazzCashService from '../../services/paymentGateways/jazzCash.service.js';
import easypaisaService from '../../services/paymentGateways/easypaisa.service.js';
import bankTransferService from '../../services/paymentGateways/bankTransfer.service.js';

/**
 * Withdrawal Service
 * Handles withdrawal request creation, processing, and history
 */
class WithdrawalService {
  /**
   * Create withdrawal request
   * @param {string} userId - User ID
   * @param {Object} withdrawalData - Withdrawal data
   * @returns {Promise<Object>} Created withdrawal request
   */
  async createWithdrawalRequest(userId, withdrawalData) {
    const { amount, paymentMethod, accountDetails } = withdrawalData;

    // Validate amount
    if (!isValidWithdrawalAmount(amount)) {
      throw createAppError(
        `Amount must be between PKR ${PAYMENT_LIMITS.MIN_WITHDRAWAL} and PKR ${PAYMENT_LIMITS.MAX_WITHDRAWAL}`,
        400
      );
    }

    // Validate payment method
    if (!Object.values(PAYMENT_METHOD).includes(paymentMethod)) {
      throw createAppError('Invalid payment method', 400);
    }

    // Check wallet balance
    const wallet = await walletService.getWallet(userId);
    if (!wallet.hasSufficientBalance(amount)) {
      throw createAppError('Insufficient available balance', 400);
    }

    // Check daily withdrawal limit
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayWithdrawals = await WithdrawalRequest.find({
      userId,
      status: { $in: [WITHDRAWAL_STATUS.SUCCESS, WITHDRAWAL_STATUS.PROCESSING] },
      createdAt: { $gte: today },
    });

    const todayTotal = todayWithdrawals.reduce((sum, w) => sum + w.amount, 0);
    if (todayTotal + amount > PAYMENT_LIMITS.MAX_DAILY_WITHDRAWAL) {
      throw createAppError(
        `Daily withdrawal limit exceeded. Maximum: PKR ${PAYMENT_LIMITS.MAX_DAILY_WITHDRAWAL}`,
        400
      );
    }

    // Validate account details based on payment method
    this.validateAccountDetails(paymentMethod, accountDetails);

    // Encrypt sensitive account details
    // Only encrypt fields that are present
    const encryptedAccountDetails = {
      accountNumber: encrypt(accountDetails.accountNumber), // Always present after validation
    };
    
    // Add optional fields only if they exist
    if (accountDetails.accountName) {
      encryptedAccountDetails.accountName = accountDetails.accountName; // Name doesn't need encryption
    }
    if (accountDetails.phoneNumber) {
      encryptedAccountDetails.phoneNumber = encrypt(accountDetails.phoneNumber);
    }
    if (accountDetails.cnic) {
      encryptedAccountDetails.cnic = encrypt(accountDetails.cnic);
    }
    if (accountDetails.bankName) {
      encryptedAccountDetails.bankName = accountDetails.bankName;
    }
    if (accountDetails.branchName) {
      encryptedAccountDetails.branchName = accountDetails.branchName;
    }
    if (accountDetails.iban) {
      encryptedAccountDetails.iban = encrypt(accountDetails.iban);
    }
    if (accountDetails.swiftCode) {
      encryptedAccountDetails.swiftCode = accountDetails.swiftCode;
    }

    // Create withdrawal request
    const withdrawalRequest = await WithdrawalRequest.create({
      userId,
      amount,
      paymentMethod,
      accountDetails: encryptedAccountDetails,
      status: WITHDRAWAL_STATUS.REQUESTED,
    });

    // Lock funds in wallet (debit available balance)
    await walletService.debitWallet(
      userId,
      amount,
      withdrawalRequest._id.toString(),
      `Withdrawal request: PKR ${amount}`
    );

    return withdrawalRequest;
  }

  /**
   * Validate account details based on payment method
   * @param {string} paymentMethod - Payment method
   * @param {Object} accountDetails - Account details
   */
  validateAccountDetails(paymentMethod, accountDetails) {
    if (!accountDetails) {
      throw createAppError('Account details are required', 400);
    }
    switch (paymentMethod) {
      case PAYMENT_METHOD.JAZZCASH:
      case PAYMENT_METHOD.EASYPAISA:
        // For mobile wallets: phoneNumber is required
        // accountNumber is optional (can be same as phoneNumber)
        if (!accountDetails.phoneNumber || !accountDetails.phoneNumber.trim()) {
          throw createAppError('Phone number is required for mobile wallet withdrawals', 400);
        }
        // If accountNumber is not provided, use phoneNumber
        if (!accountDetails.accountNumber || !accountDetails.accountNumber.trim()) {
          accountDetails.accountNumber = accountDetails.phoneNumber;
        }
        break;
      case PAYMENT_METHOD.BANK_TRANSFER:
        // For bank transfers: accountNumber, accountName, bankName are required
        // CNIC is NOT required
        if (!accountDetails.accountNumber || !accountDetails.accountNumber.trim()) {
          throw createAppError('Account number is required for bank transfers', 400);
        }
        if (!accountDetails.accountName || !accountDetails.accountName.trim()) {
          throw createAppError('Account name is required for bank transfers', 400);
        }
        if (!accountDetails.bankName || !accountDetails.bankName.trim()) {
          throw createAppError('Bank name is required for bank transfers', 400);
        }
        break;
      default:
        throw createAppError('Invalid payment method', 400);
    }
  }

  /**
   * Process withdrawal (admin action)
   * @param {string} withdrawalId - Withdrawal request ID
   * @param {string} adminId - Admin user ID
   * @returns {Promise<Object>} Processed withdrawal
   */
  async processWithdrawal(withdrawalId, adminId) {
    const withdrawal = await WithdrawalRequest.findById(withdrawalId);
    if (!withdrawal) {
      throw createAppError('Withdrawal request not found', 404);
    }

    if (withdrawal.status !== WITHDRAWAL_STATUS.REQUESTED) {
      throw createAppError(
        `Cannot process withdrawal in ${withdrawal.status} status`,
        400
      );
    }

    // Mark as processing
    await withdrawal.markProcessing(adminId);
    await withdrawal.save();

    try {
      // Process withdrawal based on payment method
      // Decrypt account details for processing
      let withdrawalResult;
      const withdrawalData = {
        amount: withdrawal.amount,
        accountNumber: decrypt(withdrawal.accountDetails.accountNumber),
        phoneNumber: withdrawal.accountDetails.phoneNumber ? decrypt(withdrawal.accountDetails.phoneNumber) : undefined,
        cnic: withdrawal.accountDetails.cnic ? decrypt(withdrawal.accountDetails.cnic) : undefined,
        accountName: withdrawal.accountDetails.accountName,
        bankName: withdrawal.accountDetails.bankName,
        branchName: withdrawal.accountDetails.branchName,
        iban: withdrawal.accountDetails.iban ? decrypt(withdrawal.accountDetails.iban) : undefined,
        swiftCode: withdrawal.accountDetails.swiftCode ? decrypt(withdrawal.accountDetails.swiftCode) : undefined,
      };

      switch (withdrawal.paymentMethod) {
        case PAYMENT_METHOD.JAZZCASH:
          withdrawalResult = await jazzCashService.processWithdrawal(withdrawalData);
          break;
        case PAYMENT_METHOD.EASYPAISA:
          withdrawalResult = await easypaisaService.processWithdrawal(withdrawalData);
          break;
        case PAYMENT_METHOD.BANK_TRANSFER:
          withdrawalResult = await bankTransferService.processWithdrawal(withdrawalData);
          break;
        default:
          throw createAppError('Payment method not supported', 400);
      }

      if (withdrawalResult.success) {
        // Mark withdrawal as success
        await withdrawal.markSuccess(
          withdrawalResult.transactionId,
          withdrawalResult.gatewayTransactionId
        );
        await withdrawal.save();

        // Update wallet total withdrawn
        const wallet = await walletService.getWallet(withdrawal.userId);
        wallet.totalWithdrawn += withdrawal.amount;
        await wallet.save();

        // Create transaction record
        await Transaction.create({
          userId: withdrawal.userId,
          type: TRANSACTION_TYPE.WITHDRAWAL,
          amount: withdrawal.amount,
          status: TRANSACTION_STATUS.SUCCESS,
          paymentMethod: withdrawal.paymentMethod,
          gatewayTransactionId: withdrawalResult.gatewayTransactionId,
          description: `Withdrawal: PKR ${withdrawal.amount} via ${withdrawal.paymentMethod}`,
        });

        return withdrawal;
      } else {
        // Mark withdrawal as failed
        await withdrawal.markFailed(withdrawalResult.message || 'Withdrawal processing failed');
        await withdrawal.save();

        // Refund to wallet
        await walletService.creditWallet(
          withdrawal.userId,
          withdrawal.amount,
          withdrawal._id.toString()
        );

        throw createAppError(
          withdrawalResult.message || 'Withdrawal processing failed',
          500
        );
      }
    } catch (error) {
      // Mark as failed if error occurred
      await withdrawal.markFailed(error.message);
      await withdrawal.save();

      // Refund to wallet
      await walletService.creditWallet(
        withdrawal.userId,
        withdrawal.amount,
        withdrawal._id.toString()
      );

      throw error;
    }
  }

  /**
   * Cancel withdrawal request
   * @param {string} withdrawalId - Withdrawal request ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Cancelled withdrawal
   */
  async cancelWithdrawal(withdrawalId, userId) {
    const withdrawal = await WithdrawalRequest.findById(withdrawalId);
    if (!withdrawal) {
      throw createAppError('Withdrawal request not found', 404);
    }

    if (withdrawal.userId.toString() !== userId.toString()) {
      throw createAppError('Unauthorized to cancel this withdrawal', 403);
    }

    // Cancel withdrawal
    await withdrawal.cancel(userId);
    await withdrawal.save();

    // Refund to wallet
    await walletService.creditWallet(
      userId,
      withdrawal.amount,
      withdrawal._id.toString()
    );

    return withdrawal;
  }

  /**
   * Get withdrawal history for user
   * @param {string} userId - User ID
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} Array of withdrawal requests
   */
  async getWithdrawalHistory(userId, filters = {}) {
    return WithdrawalRequest.getUserWithdrawals(userId, filters);
  }

  /**
   * Get pending withdrawals (admin)
   * @returns {Promise<Array>} Array of pending withdrawal requests
   */
  async getPendingWithdrawals() {
    return WithdrawalRequest.getPendingWithdrawals();
  }

  /**
   * Get withdrawal by ID
   * @param {string} withdrawalId - Withdrawal request ID
   * @returns {Promise<Object>} Withdrawal request
   */
  async getWithdrawalById(withdrawalId) {
    const withdrawal = await WithdrawalRequest.findById(withdrawalId)
      .populate('user', 'name email')
      .populate('processor', 'name email');
    if (!withdrawal) {
      throw createAppError('Withdrawal request not found', 404);
    }
    return withdrawal;
  }

  /**
   * Reject withdrawal (admin action)
   * @param {string} withdrawalId - Withdrawal request ID
   * @param {string} adminId - Admin user ID
   * @param {string} reason - Rejection reason
   * @returns {Promise<Object>} Rejected withdrawal
   */
  async rejectWithdrawal(withdrawalId, adminId, reason) {
    const withdrawal = await WithdrawalRequest.findById(withdrawalId);
    if (!withdrawal) {
      throw createAppError('Withdrawal request not found', 404);
    }

    if (withdrawal.status !== WITHDRAWAL_STATUS.REQUESTED) {
      throw createAppError(
        `Cannot reject withdrawal in ${withdrawal.status} status`,
        400
      );
    }

    // Mark as failed
    await withdrawal.markFailed(reason || 'Withdrawal rejected by admin');
    await withdrawal.save();

    // Refund to wallet
    await walletService.creditWallet(
      withdrawal.userId,
      withdrawal.amount,
      withdrawal._id.toString()
    );

    return withdrawal;
  }
}

export default new WithdrawalService();

