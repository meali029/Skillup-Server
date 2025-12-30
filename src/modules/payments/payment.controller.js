import paymentService from './payment.service.js';
import walletService from './wallet.service.js';
import withdrawalService from './withdrawal.service.js';
import escrowService from './escrow.service.js';
import { asyncHandler } from '../../core/utils/index.js';
import { createAppError } from '../../core/errors/index.js';
import { createAuditLog } from '../../core/utils/auditLogger.js';

/**
 * Payment Controller
 * Handles HTTP requests for payment operations
 */

// Initialize deposit
export const initializeDeposit = asyncHandler(async (req, res) => {
  let { amount, paymentMethod, customerData } = req.body;
  const userId = req.user.id;

  // Ensure amount is a number
  amount = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(amount) || amount <= 0) {
    throw createAppError('Invalid amount. Amount must be a positive number', 400);
  }

  // Clean customerData - remove empty strings and null values
  const cleanedCustomerData = customerData ? {
    ...(customerData.email && customerData.email.trim() ? { email: customerData.email.trim() } : {}),
    ...(customerData.name && customerData.name.trim() ? { name: customerData.name.trim() } : {}),
    ...(customerData.phone && customerData.phone.trim() ? { phone: customerData.phone.trim() } : {}),
  } : {};

  try {
    const result = await paymentService.initializeDeposit(
      userId,
      amount,
      paymentMethod,
      Object.keys(cleanedCustomerData).length > 0 ? cleanedCustomerData : {}
    );

    // Audit log
    await createAuditLog({
      userId,
      action: 'PAYMENT_DEPOSIT_INITIALIZED',
      targetType: 'Transaction',
      targetId: result.transactionId,
      details: {
        amount,
        paymentMethod,
      },
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    // Log the error for debugging with full details
    console.error('Payment initialization error:', {
      message: error.message,
      stack: error.stack,
      statusCode: error.statusCode,
      userId,
      amount,
      paymentMethod,
      customerData: cleanedCustomerData,
    });
    throw error; // Re-throw to let error handler process it
  }
});

// Verify deposit
export const verifyDeposit = asyncHandler(async (req, res) => {
  const { transactionId, callbackData, paymentMethod } = req.body;

  const result = await paymentService.verifyDeposit(
    transactionId,
    callbackData,
    paymentMethod
  );

  res.status(200).json({
    success: result.success,
    data: result,
  });
});

// Get wallet balance
export const getWallet = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const wallet = await walletService.getWallet(userId);
  const balance = await walletService.getBalanceSummary(userId);

  res.status(200).json({
    success: true,
    data: {
      wallet: {
        _id: wallet._id,
        userId: wallet.userId,
        ...balance,
        paymentMethods: wallet.paymentMethods,
        bankAccount: wallet.bankAccount,
      },
    },
  });
});

// Get transaction history
export const getTransactions = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const filters = req.query;

  const result = await paymentService.getTransactionHistory(userId, filters);

  res.status(200).json({
    success: true,
    data: result,
  });
});

// Get payment methods
export const getPaymentMethods = asyncHandler(async (req, res) => {
  const methods = paymentService.getPaymentMethods();
  const limits = paymentService.getPaymentLimits();

  res.status(200).json({
    success: true,
    data: {
      methods,
      limits,
    },
  });
});

// Create withdrawal request
export const createWithdrawal = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  let { amount, paymentMethod, accountDetails } = req.body;

  // Ensure amount is a number
  amount = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(amount) || amount <= 0) {
    throw createAppError('Invalid amount. Amount must be a positive number', 400);
  }

  // Validate and clean accountDetails based on payment method
  if (!accountDetails) {
    throw createAppError('Account details are required', 400);
  }

  // Clean accountDetails - remove empty strings and null values
  const cleanedAccountDetails = {};
  
  if (paymentMethod === 'JAZZCASH' || paymentMethod === 'EASYPAISA') {
    // For mobile wallets: phoneNumber is required
    if (!accountDetails.phoneNumber || !accountDetails.phoneNumber.trim()) {
      throw createAppError('Phone number is required for mobile wallet withdrawals', 400);
    }
    cleanedAccountDetails.phoneNumber = accountDetails.phoneNumber.trim();
    // Account number can be phone number for mobile wallets
    if (accountDetails.accountNumber && accountDetails.accountNumber.trim()) {
      cleanedAccountDetails.accountNumber = accountDetails.accountNumber.trim();
    } else {
      // Use phone number as account number if not provided
      cleanedAccountDetails.accountNumber = cleanedAccountDetails.phoneNumber;
    }
    // CNIC is optional
    if (accountDetails.cnic && accountDetails.cnic.trim()) {
      cleanedAccountDetails.cnic = accountDetails.cnic.trim();
    }
  } else if (paymentMethod === 'BANK_TRANSFER') {
    // For bank transfers: accountNumber, accountName, bankName are required
    if (!accountDetails.accountNumber || !accountDetails.accountNumber.trim()) {
      throw createAppError('Account number is required for bank transfers', 400);
    }
    if (!accountDetails.accountName || !accountDetails.accountName.trim()) {
      throw createAppError('Account name is required for bank transfers', 400);
    }
    if (!accountDetails.bankName || !accountDetails.bankName.trim()) {
      throw createAppError('Bank name is required for bank transfers', 400);
    }
    cleanedAccountDetails.accountNumber = accountDetails.accountNumber.trim();
    cleanedAccountDetails.accountName = accountDetails.accountName.trim();
    cleanedAccountDetails.bankName = accountDetails.bankName.trim();
    // Optional fields
    if (accountDetails.branchName && accountDetails.branchName.trim()) {
      cleanedAccountDetails.branchName = accountDetails.branchName.trim();
    }
    if (accountDetails.iban && accountDetails.iban.trim()) {
      cleanedAccountDetails.iban = accountDetails.iban.trim();
    }
    if (accountDetails.swiftCode && accountDetails.swiftCode.trim()) {
      cleanedAccountDetails.swiftCode = accountDetails.swiftCode.trim();
    }
    // CNIC is NOT required for bank transfers
  }

  const withdrawalData = {
    amount,
    paymentMethod,
    accountDetails: cleanedAccountDetails,
  };

  const withdrawal = await withdrawalService.createWithdrawalRequest(
    userId,
    withdrawalData
  );

  // Audit log
  await createAuditLog({
    userId,
    action: 'WITHDRAWAL_REQUESTED',
    targetType: 'WithdrawalRequest',
    targetId: withdrawal._id.toString(),
    details: {
      amount: withdrawal.amount,
      paymentMethod: withdrawal.paymentMethod,
    },
  });

  res.status(201).json({
    success: true,
    data: withdrawal,
  });
});

// Get withdrawal history
export const getWithdrawals = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const filters = req.query;

  const withdrawals = await withdrawalService.getWithdrawalHistory(
    userId,
    filters
  );

  res.status(200).json({
    success: true,
    data: withdrawals,
  });
});

// Get withdrawal by ID
export const getWithdrawal = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const withdrawal = await withdrawalService.getWithdrawalById(id);

  // Verify user owns this withdrawal or is admin
  if (
    withdrawal.userId.toString() !== userId.toString() &&
    req.user.role !== 'admin'
  ) {
    throw createAppError('Unauthorized to view this withdrawal', 403);
  }

  res.status(200).json({
    success: true,
    data: withdrawal,
  });
});

// Cancel withdrawal
export const cancelWithdrawal = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const withdrawal = await withdrawalService.cancelWithdrawal(id, userId);

  res.status(200).json({
    success: true,
    data: withdrawal,
    message: 'Withdrawal cancelled successfully',
  });
});

// Get escrow by contract
export const getContractEscrows = asyncHandler(async (req, res) => {
  const { contractId } = req.params;
  const userId = req.user.id;

  // Verify user has access to contract
  const Contract = (await import('../../models/Contract.js')).default;
  const contract = await Contract.findById(contractId);
  if (!contract) {
    throw createAppError('Contract not found', 404);
  }

  if (!contract.canBeViewedBy(userId)) {
    throw createAppError('Unauthorized to view this contract', 403);
  }

  const escrows = await escrowService.getEscrowByContract(contractId);

  res.status(200).json({
    success: true,
    data: escrows,
  });
});

// Get escrow by milestone
export const getMilestoneEscrow = asyncHandler(async (req, res) => {
  const { contractId, milestoneId } = req.params;
  const userId = req.user.id;

  // Verify user has access to contract
  const Contract = (await import('../../models/Contract.js')).default;
  const contract = await Contract.findById(contractId);
  if (!contract) {
    throw createAppError('Contract not found', 404);
  }

  if (!contract.canBeViewedBy(userId)) {
    throw createAppError('Unauthorized to view this contract', 403);
  }

  const escrow = await escrowService.getEscrowByMilestone(
    contractId,
    milestoneId
  );

  res.status(200).json({
    success: true,
    data: escrow,
  });
});

// Handle mock payment callback (for testing mode)
export const handleMockCallback = asyncHandler(async (req, res) => {
  const { txnRef, orderId, amount, status } = req.query;

  // Verify payment using mock service
  const mockPaymentService = (await import('../../services/paymentGateways/mockPayment.service.js')).default;
  const verificationResult = await mockPaymentService.verifyPayment({
    txnRef,
    orderId,
    amount,
    status: status || 'success',
  });

  if (verificationResult.success) {
    // Find transaction by gateway transaction ID or order ID
    // The orderId format is DEP{timestamp}-{userId}
    const Transaction = (await import('../../models/Transaction.js')).default;
    
    // Try multiple lookup strategies
    let transaction = await Transaction.findOne({
      gatewayTransactionId: txnRef,
      status: 'PENDING',
      type: 'DEPOSIT',
    });

    // If not found by txnRef, try orderId
    if (!transaction && orderId) {
      transaction = await Transaction.findOne({
        $or: [
          { gatewayTransactionId: orderId },
          { description: { $regex: orderId } }, // Search in description
        ],
        status: 'PENDING',
        type: 'DEPOSIT',
      }).sort({ createdAt: -1 }); // Get most recent if multiple found
    }

    if (transaction) {
      // Verify deposit
      try {
        const result = await paymentService.verifyDeposit(
          transaction._id.toString(),
          {
            txnRef,
            orderId,
            amount,
            status: 'success',
          },
          transaction.paymentMethod
        );

        // Redirect to success page
        const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
        return res.redirect(`${clientUrl}/wallet?payment=success&transactionId=${transaction._id}`);
      } catch (error) {
        console.error('Error verifying mock payment:', error);
        const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
        return res.redirect(`${clientUrl}/wallet?payment=error&message=${encodeURIComponent(error.message)}`);
      }
    } else {
      // Transaction not found - log for debugging
      console.error('Mock payment callback: Transaction not found', { txnRef, orderId, amount });
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
      return res.redirect(`${clientUrl}/wallet?payment=error&message=Transaction not found`);
    }
  }

  // If transaction not found or verification failed, redirect to error page
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
  return res.redirect(`${clientUrl}/wallet?payment=failed`);
});

