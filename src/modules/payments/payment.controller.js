import paymentService from './payment.service.js';
import walletService from './wallet.service.js';
import withdrawalService from './withdrawal.service.js';
import escrowService from './escrow.service.js';
import paymentModeService from '../../services/paymentGateways/paymentMode.service.js';
import subscriptionService from '../subscriptions/subscription.service.js';
import Transaction from '../../models/Transaction.js';
import Escrow from '../../models/Escrow.js';
import Contract from '../../models/Contract.js';
import { asyncHandler } from '../../core/utils/index.js';
import { createAppError } from '../../core/errors/index.js';
import { verifyPendingSafepayTransactions } from './safepay-verification.service.js';

/**
 * Payment Controller
 * Handles HTTP requests for payment operations
 */

/**
 * Auto-fund escrow and activate contract when a Safepay transaction completes.
 * Uses the atomic fundEscrow in escrowService to prevent double-funding.
 */
async function autoFundEscrowAndActivateContract(transaction, logPrefix = 'Payment') {
  if (!transaction.escrowId) return;
  try {
    const escrow = await Escrow.findById(transaction.escrowId);
    if (!escrow) return;

    if (escrow.status === 'CREATED') {
      await escrowService.fundEscrow(transaction.escrowId.toString(), {
        transactionId: transaction._id.toString(),
        paymentMethod: transaction.paymentMethod,
        gatewayTransactionId: transaction.gatewayTransactionId,
      });
    }

    // Activate contract atomically if this is the initial contract escrow
    if (escrow.contractId && escrow.milestoneId === 'TOTAL') {
      const activated = await Contract.findOneAndUpdate(
        { _id: escrow.contractId, status: 'pending' },
        { $set: { paymentStatus: 'COMPLETED', status: 'active' } },
        { new: true }
      );
      if (activated) {
        console.log(`${logPrefix}: contract`, escrow.contractId, 'activated');
      } else {
        // Contract may already be active or in another state — update paymentStatus only
        await Contract.updateOne(
          { _id: escrow.contractId, paymentStatus: { $ne: 'COMPLETED' } },
          { $set: { paymentStatus: 'COMPLETED' } }
        );
      }
    }
  } catch (escrowErr) {
    console.error(`${logPrefix}: escrow fund error for txn`, transaction._id, escrowErr.message);
    // Revert transaction status and reverse wallet credit to avoid inconsistent state
    try {
      await Transaction.updateOne(
        { _id: transaction._id, status: 'SUCCESS' },
        { $set: { status: 'FAILED', failureReason: `Escrow funding failed: ${escrowErr.message}` } }
      );
      await walletService.debitWallet(transaction.userId, transaction.amount, {
        description: `Reversal: escrow fund failed for txn ${transaction._id}`,
        type: 'REVERSAL',
      });
      console.error(`${logPrefix}: reverted txn ${transaction._id} and debited wallet for user ${transaction.userId}`);
    } catch (revertErr) {
      console.error(`${logPrefix}: CRITICAL — failed to revert txn ${transaction._id}:`, revertErr.message);
    }
  }
}

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

    // Note: Payment actions are logged in Transaction model, not AuditLog
    // AuditLog is for admin actions only

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
  const methods = await paymentService.getPaymentMethods();
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

  // Note: Withdrawal requests are logged in WithdrawalRequest and Transaction models
  // AuditLog is for admin actions only

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

// Verify pending Safepay transactions for a user (called by frontend on wallet/pricing page load)
export const verifySafepayPending = asyncHandler(async (req, res) => {
  const result = await verifyPendingSafepayTransactions({
    userId: req.user.id,
    logPrefix: 'Safepay user auto-verify',
  });

  return res.status(200).json({
    success: true,
    data: result,
  });
});

// Cancel the most recent pending Safepay transaction (deposit or subscription) for a user
export const cancelSafepayPending = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const cancelled = await Transaction.findOneAndUpdate(
    {
      userId,
      paymentMethod: 'SAFEPAY',
      status: 'PENDING',
      type: { $in: ['DEPOSIT', 'SUBSCRIPTION'] },
    },
    { status: 'FAILED', failureReason: 'Cancelled by user', completedAt: new Date() },
    { sort: { createdAt: -1 }, new: true }
  );

  if (!cancelled) {
    return res.status(200).json({ success: true, data: { cancelled: 0 } });
  }

  return res.status(200).json({ success: true, data: { cancelled: 1, transactionId: cancelled._id } });
});

// Handle Safepay webhook (POST - called by Safepay servers)
export const handleSafepayWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers['x-sfpy-signature'] || req.headers['x-safepay-signature'];

  // Import safepay service for signature verification
  const safepayService = (await import('../../services/paymentGateways/safepay.service.js')).default;

  // Verify webhook signature if secret is configured
  const creds = safepayService.getCredentials();
  if (creds.webhookSecret && signature) {
    const rawBody = req.rawBody || JSON.stringify(req.body);
    const isValid = safepayService.verifyWebhookSignature(
      typeof rawBody === 'string' ? rawBody : JSON.stringify(req.body),
      signature
    );
    if (!isValid) {
      console.warn('Safepay webhook signature mismatch');
      // In production, reject; in sandbox, continue with warning
      if (!creds.sandbox) {
        return res.status(400).json({ error: 'Invalid webhook signature' });
      }
    }
  }

  // Safepay webhook format: { data: { type, notification: { tracker, state, amount, metadata, ... } } }
  const webhookData = req.body?.data || req.body;
  const notification = webhookData?.notification || {};
  const eventType = webhookData?.type || req.body?.type;

  // Extract fields from the notification object
  const state = notification?.state || webhookData?.state;
  const tracker = notification?.tracker || webhookData?.tracker;
  const orderRef = notification?.metadata?.order_id || webhookData?.metadata?.order_id || webhookData?.order_id;

  console.log('Safepay webhook parsed:', { eventType, state, tracker, orderRef });

  // Only process payment-related events
  if (eventType && !eventType.startsWith('payment:')) {
    return res.status(200).json({ received: true });
  }

  // Check if payment is successful
  const isPaid = state === 'PAID' || state === 'TRACKER_ENDED' || eventType === 'payment:created';

  if (!tracker && !orderRef) {
    console.log('Safepay webhook: No tracker or order ref, skipping');
    return res.status(200).json({ received: true });
  }

  // Find the pending transaction - try tracker first, then orderRef (no dangerous fallback)
  let transaction;

  if (tracker) {
    transaction = await Transaction.findOne({
      gatewayTransactionId: tracker,
      status: 'PENDING',
      type: { $in: ['DEPOSIT', 'SUBSCRIPTION'] },
    });
  }

  if (!transaction && orderRef) {
    transaction = await Transaction.findOne({
      gatewayTransactionId: orderRef,
      status: 'PENDING',
      type: { $in: ['DEPOSIT', 'SUBSCRIPTION'] },
    }).sort({ createdAt: -1 });
  }

  if (!transaction) {
    console.log('Safepay webhook: No pending transaction found', { tracker, orderRef });
    return res.status(200).json({ received: true });
  }

  try {
    if (isPaid) {
      // Atomic update: only update if still PENDING to prevent double-credit
      const updated = await Transaction.findOneAndUpdate(
        { _id: transaction._id, status: 'PENDING' },
        { status: 'SUCCESS', completedAt: new Date(), gatewayTransactionId: tracker || transaction.gatewayTransactionId },
        { new: true }
      );
      if (updated) {
        if (updated.type === 'SUBSCRIPTION') {
          // Activate subscription after Safepay payment
          await subscriptionService.activateAfterPayment(updated._id);
          console.log('Safepay webhook: Subscription activated', { userId: updated.userId });
        } else {
          await walletService.creditExistingDeposit(updated.userId, updated.amount);
          console.log('Safepay webhook: Payment credited', { amount: updated.amount, userId: updated.userId });

          // Auto-fund escrow if this deposit is linked to one
          await autoFundEscrowAndActivateContract(updated, 'Safepay webhook');
        }
      } else {
        console.log('Safepay webhook: Transaction already processed', transaction._id);
      }
    } else {
      console.log('Safepay webhook: Payment not in PAID state:', state);
    }
  } catch (error) {
    console.error('Safepay webhook: Error processing payment', error.message);
  }

  res.status(200).json({ received: true });
});

// Handle Safepay callback redirect (GET - user returns from Safepay checkout)
export const handleSafepayCallback = asyncHandler(async (req, res) => {
  const tracker = req.query.tracker || req.query.ref || req.query.session || req.query.token;
  const orderId = req.query.order_id || req.query.orderId;
  const referenceCode = req.query.reference_code || req.query.reference;
  const sig = req.query.sig || req.query.signature;
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

  if (!tracker && !orderId) {
    return res.redirect(`${clientUrl}/wallet?payment=error&message=Missing+payment+reference`);
  }

  // Find the pending transaction by tracker or orderId (no dangerous fallback)
  let transaction;
  
  if (tracker) {
    transaction = await Transaction.findOne({
      gatewayTransactionId: tracker,
      status: 'PENDING',
      type: { $in: ['DEPOSIT', 'SUBSCRIPTION'] },
    });
  }
  
  if (!transaction && orderId) {
    transaction = await Transaction.findOne({
      gatewayTransactionId: orderId,
      status: 'PENDING',
      type: { $in: ['DEPOSIT', 'SUBSCRIPTION'] },
    }).sort({ createdAt: -1 });
  }

  if (!transaction) {
    // Transaction may have already been processed by webhook
    const searchId = tracker || orderId;
    const processed = await Transaction.findOne({
      gatewayTransactionId: searchId,
      type: { $in: ['DEPOSIT', 'SUBSCRIPTION'] },
    });
    if (processed && processed.status === 'SUCCESS') {
      const redirectPath = processed.type === 'SUBSCRIPTION' ? '/pricing?payment=success' : `/wallet?payment=success&transactionId=${processed._id}`;
      return res.redirect(`${clientUrl}${redirectPath}`);
    }
    return res.redirect(`${clientUrl}/wallet?payment=error&message=Transaction+not+found`);
  }

  try {
    // Verify payment status server-side via Safepay API
    const safepayService = (await import('../../services/paymentGateways/safepay.service.js')).default;
    const verifyTracker = tracker || transaction.gatewayTransactionId;
    
    const verificationResult = await safepayService.verifyPaymentByTracker(verifyTracker, orderId);

    if (verificationResult.success) {
      // Atomic update: only update if still PENDING to prevent double-credit
      const updated = await Transaction.findOneAndUpdate(
        { _id: transaction._id, status: 'PENDING' },
        { status: 'SUCCESS', completedAt: new Date(), gatewayTransactionId: verificationResult.gatewayTransactionId || verifyTracker },
        { new: true }
      );

      if (updated) {
        if (updated.type === 'SUBSCRIPTION') {
          // Activate subscription after Safepay payment
          await subscriptionService.activateAfterPayment(updated._id);
          return res.redirect(`${clientUrl}/pricing?payment=success`);
        }

        await walletService.creditExistingDeposit(updated.userId, updated.amount);

        // Auto-fund escrow if this deposit is linked to one
        await autoFundEscrowAndActivateContract(updated, 'Safepay callback');

        return res.redirect(`${clientUrl}/wallet?payment=success&transactionId=${updated._id}`);
      } else {
        // Already processed by webhook
        const redirectPath = transaction.type === 'SUBSCRIPTION' ? '/pricing?payment=success' : `/wallet?payment=success&transactionId=${transaction._id}`;
        return res.redirect(`${clientUrl}${redirectPath}`);
      }
    } else {
      return res.redirect(`${clientUrl}/wallet?payment=failed&message=${encodeURIComponent(verificationResult.responseMessage || 'Payment failed')}`);
    }
  } catch (error) {
    console.error('Safepay callback error:', error.message);
    return res.redirect(`${clientUrl}/wallet?payment=error&message=${encodeURIComponent(error.message)}`);
  }
});

// Handle mock payment callback (for testing mode ONLY)
export const handleMockCallback = asyncHandler(async (req, res) => {
  // PRODUCTION SAFEGUARD: Block mock payments in production mode
  const isTesting = await paymentModeService.isTestingMode();
  if (!isTesting) {
    throw createAppError('Mock payments are not available in production mode', 403);
  }

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
        const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
        return res.redirect(`${clientUrl}/wallet?payment=success&transactionId=${transaction._id}`);
      } catch (error) {
        console.error('Error verifying mock payment:', error);
        const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
        return res.redirect(`${clientUrl}/wallet?payment=error&message=${encodeURIComponent(error.message)}`);
      }
    } else {
      // Transaction not found - log for debugging
      console.error('Mock payment callback: Transaction not found', { txnRef, orderId, amount });
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
      return res.redirect(`${clientUrl}/wallet?payment=error&message=Transaction not found`);
    }
  }

  // If transaction not found or verification failed, redirect to error page
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  return res.redirect(`${clientUrl}/wallet?payment=failed`);
});

// Get payment mode (public endpoint for testing mode banner)
export const getPaymentMode = asyncHandler(async (req, res) => {
  const mode = await paymentModeService.getMode();
  const isTesting = mode === 'testing';

  res.status(200).json({
    success: true,
    data: {
      mode,
      isTesting,
      message: isTesting 
        ? 'Payment system is in testing mode. No real transactions will occur.'
        : 'Payment system is in production mode. Real transactions will be processed.',
    },
  });
});

// Get single transaction by ID
export const getTransactionById = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { transactionId } = req.params;

  const transaction = await Transaction.findById(transactionId)
    .populate('userId', 'name email avatar')
    .populate('counterPartyId', 'name email avatar')
    .populate('escrowId', 'amount status contractId milestoneId')
    .populate('contractId', 'title status totalAmount')
    .lean();

  if (!transaction) {
    throw createAppError('Transaction not found', 404);
  }

  // Users can only view their own transactions (unless admin)
  if (transaction.userId?._id?.toString() !== userId && 
      transaction.counterPartyId?._id?.toString() !== userId &&
      req.user.role !== 'admin') {
    throw createAppError('Unauthorized to view this transaction', 403);
  }

  res.status(200).json({
    success: true,
    data: { transaction },
  });
});
