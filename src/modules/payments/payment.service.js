import walletService from './wallet.service.js';
import Transaction from '../../models/Transaction.js';
import { createAppError } from '../../core/errors/index.js';
import {
  PAYMENT_METHOD,
  TRANSACTION_TYPE,
  TRANSACTION_STATUS,
  PAYMENT_LIMITS,
  isValidDepositAmount,
} from './payment.constants.js';
import jazzCashService from '../../services/paymentGateways/jazzCash.service.js';
import easypaisaService from '../../services/paymentGateways/easypaisa.service.js';
import bankTransferService from '../../services/paymentGateways/bankTransfer.service.js';

/**
 * Payment Service
 * Handles payment initialization, verification, and transaction history
 */
class PaymentService {
  /**
   * Initialize deposit payment
   * @param {string} userId - User ID
   * @param {number} amount - Deposit amount
   * @param {string} paymentMethod - Payment method
   * @param {Object} customerData - Customer information
   * @param {Object} options - Additional options (escrowId, contractId)
   * @returns {Promise<Object>} Payment initialization response
   */
  async initializeDeposit(userId, amount, paymentMethod, customerData = {}, options = {}) {
    // Validate amount
    if (!isValidDepositAmount(amount)) {
      throw createAppError(
        `Amount must be between PKR ${PAYMENT_LIMITS.MIN_DEPOSIT} and PKR ${PAYMENT_LIMITS.MAX_DEPOSIT}`,
        400
      );
    }

    // Validate payment method
    if (!Object.values(PAYMENT_METHOD).includes(paymentMethod)) {
      throw createAppError('Invalid payment method', 400);
    }

    // Generate order ID
    const orderId = `DEP${Date.now()}-${userId}`;

    // Create pending transaction
    const transactionMetadata = new Map();
    if (options.isContractCreation) {
      transactionMetadata.set('isContractCreation', true);
    }

    const transaction = await Transaction.create({
      userId,
      type: TRANSACTION_TYPE.DEPOSIT,
      amount,
      status: TRANSACTION_STATUS.PENDING,
      paymentMethod,
      gatewayTransactionId: orderId,
      description: `Deposit: PKR ${amount} via ${paymentMethod}`,
      escrowId: options.escrowId,
      contractId: options.contractId,
      metadata: transactionMetadata.size > 0 ? transactionMetadata : undefined,
    });

    // Initialize payment based on method
    let paymentResponse;
    const paymentData = {
      amount,
      orderId,
      customerEmail: customerData.email,
      customerName: customerData.name,
      customerPhone: customerData.phone,
    };

    try {
      switch (paymentMethod) {
        case PAYMENT_METHOD.JAZZCASH:
          paymentResponse = await jazzCashService.initializePayment(paymentData);
          break;
        case PAYMENT_METHOD.EASYPAISA:
          paymentResponse = await easypaisaService.initializePayment(paymentData);
          break;
        case PAYMENT_METHOD.BANK_TRANSFER:
          paymentResponse = await bankTransferService.initializePayment(paymentData);
          break;
        default:
          throw createAppError('Payment method not supported', 400);
      }
    } catch (error) {
      console.error('Payment gateway initialization error:', {
        paymentMethod,
        error: error.message,
        stack: error.stack,
        paymentData,
      });
      throw createAppError(
        `Failed to initialize ${paymentMethod} payment: ${error.message}`,
        500
      );
    }

    // Update transaction with gateway transaction ID
    // Use transactionRef from payment response, or fall back to orderId
    transaction.gatewayTransactionId = paymentResponse.transactionRef || paymentResponse.transactionId || orderId;
    await transaction.save();

    return {
      transactionId: transaction._id.toString(),
      orderId,
      paymentUrl: paymentResponse.paymentUrl,
      paymentMethod,
      amount,
      requiresManualVerification: paymentResponse.requiresManualVerification || false,
      bankAccount: paymentResponse.bankAccount,
      referenceNumber: paymentResponse.referenceNumber,
    };
  }

  /**
   * Verify deposit payment callback
   * @param {string} transactionId - Transaction ID
   * @param {Object} callbackData - Callback data from gateway
   * @param {string} paymentMethod - Payment method
   * @returns {Promise<Object>} Verification result
   */
  async verifyDeposit(transactionId, callbackData, paymentMethod) {
    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      throw createAppError('Transaction not found', 404);
    }

    if (transaction.status !== TRANSACTION_STATUS.PENDING) {
      throw createAppError('Transaction already processed', 400);
    }

    // Verify payment based on method
    let verificationResult;
    switch (paymentMethod) {
      case PAYMENT_METHOD.JAZZCASH:
        verificationResult = await jazzCashService.verifyPayment(callbackData);
        break;
      case PAYMENT_METHOD.EASYPAISA:
        verificationResult = await easypaisaService.verifyPayment(callbackData);
        break;
      case PAYMENT_METHOD.BANK_TRANSFER:
        // Bank transfers require manual verification
        verificationResult = await bankTransferService.verifyPayment(callbackData);
        break;
      default:
        throw createAppError('Payment method not supported', 400);
    }

    if (verificationResult.success) {
      // Update transaction before crediting wallet
      transaction.gatewayTransactionId = verificationResult.gatewayTransactionId;
      await transaction.markSuccess();

      // Credit wallet
      await walletService.creditWallet(
        transaction.userId,
        verificationResult.amount,
        verificationResult.gatewayTransactionId
      );

      // Check if this transaction is for an escrow and auto-fund it
      if (transaction.escrowId) {
        const escrowService = (await import('./escrow.service.js')).default;
        const Escrow = (await import('../../models/Escrow.js')).default;
        const Contract = (await import('../../models/Contract.js')).default;
        try {
          const escrow = await Escrow.findById(transaction.escrowId);
          // Only auto-fund if escrow is in CREATED status (not already funded)
          if (escrow && escrow.status === 'CREATED') {
            await escrowService.fundEscrow(transaction.escrowId.toString(), {
              transactionId: transaction._id.toString(),
              paymentMethod: transaction.paymentMethod,
              gatewayTransactionId: verificationResult.gatewayTransactionId,
            });

            // If this is for contract creation, update contract payment status
            if (escrow.contractId && escrow.milestoneId === 'TOTAL') {
              const contract = await Contract.findById(escrow.contractId);
              if (contract) {
                contract.paymentStatus = 'COMPLETED';
                await contract.save();
                
                // TODO: Send notification to freelancer that contract is ready for acceptance
                console.log(`Contract ${contract._id} payment completed, ready for freelancer acceptance`);
              }
            }
          }
        } catch (error) {
          // Log error but don't fail the deposit - escrow can be funded manually
          console.error('Failed to auto-fund escrow:', error);
        }
      }

      return {
        success: true,
        transactionId: transaction._id.toString(),
        amount: verificationResult.amount,
        message: 'Payment verified and wallet credited',
      };
    } else {
      // Mark transaction as failed
      await transaction.markFailed(verificationResult.responseMessage);

      return {
        success: false,
        transactionId: transaction._id.toString(),
        message: verificationResult.responseMessage || 'Payment verification failed',
      };
    }
  }

  /**
   * Get transaction history for user
   * @param {string} userId - User ID
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} Transaction history with pagination
   */
  async getTransactionHistory(userId, filters = {}) {
    const {
      type,
      status,
      paymentMethod,
      startDate,
      endDate,
      page = 1,
      limit = 20,
    } = filters;

    const query = { userId };

    if (type) query.type = type;
    if (status) query.status = status;
    if (paymentMethod) query.paymentMethod = paymentMethod;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('escrowId', 'amount status')
        .populate('contractId', 'title')
        .lean(),
      Transaction.countDocuments(query),
    ]);

    return {
      transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get available payment methods
   * @returns {Array} Array of available payment methods
   */
  getPaymentMethods() {
    return [
      {
        value: PAYMENT_METHOD.JAZZCASH,
        label: 'JazzCash',
        icon: 'jazzcash',
        available: true,
      },
      {
        value: PAYMENT_METHOD.EASYPAISA,
        label: 'Easypaisa',
        icon: 'easypaisa',
        available: true,
      },
      {
        value: PAYMENT_METHOD.BANK_TRANSFER,
        label: 'Bank Transfer',
        icon: 'bank',
        available: true,
      },
    ];
  }

  /**
   * Get payment limits
   * @returns {Object} Payment limits
   */
  getPaymentLimits() {
    return PAYMENT_LIMITS;
  }
}

export default new PaymentService();

