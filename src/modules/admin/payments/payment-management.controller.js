import mongoose from 'mongoose';
import paymentService from '../../payments/payment.service.js';
import withdrawalService from '../../payments/withdrawal.service.js';
import escrowService from '../../payments/escrow.service.js';
import walletService from '../../payments/wallet.service.js';
import Transaction from '../../../models/Transaction.js';
import PlatformWallet from '../../../models/PlatformWallet.js';
import PlatformWithdrawal from '../../../models/PlatformWithdrawal.js';
import { asyncHandler } from '../../../core/utils/index.js';
import { createAppError } from '../../../core/errors/index.js';
import paymentModeService from '../../../services/paymentGateways/paymentMode.service.js';
import { refreshEnvFromDatabase } from '../../../core/utils/envLoader.js';
import { createAuditLog } from '../../../core/utils/auditLogger.js';
import { PLATFORM_FEE, PAYMENT_LIMITS } from '../../../config/payment.config.js';
import jazzCashService from '../../../services/paymentGateways/jazzCash.service.js';
import easypaisaService from '../../../services/paymentGateways/easypaisa.service.js';

/**
 * Admin Payment Management Controller
 * Handles admin operations for payments, withdrawals, escrows, and platform revenue
 */

// Get platform revenue statistics
export const getPlatformRevenueStats = asyncHandler(async (req, res) => {
  const stats = await walletService.getPlatformRevenueStats();
  const todayRevenue = await PlatformWallet.getTodayRevenue();
  const escrowStats = await escrowService.getEscrowStats();

  res.status(200).json({
    success: true,
    data: {
      platformFeePercentage: PLATFORM_FEE.percentage,
      ...stats,
      todayRevenue,
      escrowStats,
    },
  });
});

// Get detailed revenue analytics
export const getRevenueAnalytics = asyncHandler(async (req, res) => {
  const { months = 12 } = req.query;
  
  // Get platform wallet stats
  const platformWallet = await PlatformWallet.getWallet();
  
  // Get monthly revenue breakdown
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - parseInt(months) + 1, 1);
  
  // Aggregate fee transactions by month
  const monthlyRevenue = await Transaction.aggregate([
    {
      $match: {
        type: 'PLATFORM_FEE',
        status: 'SUCCESS',
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
        },
        totalFees: { $sum: '$amount' },
        transactionCount: { $sum: 1 },
        avgFee: { $avg: '$amount' },
      },
    },
    {
      $sort: { '_id.year': 1, '_id.month': 1 },
    },
  ]);

  // Aggregate by payment method
  const revenueByMethod = await Transaction.aggregate([
    {
      $match: {
        type: 'ESCROW_RELEASE',
        status: 'SUCCESS',
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: '$paymentMethod',
        total: { $sum: '$amount' },
        count: { $sum: 1 },
        totalFees: { $sum: '$platformFee' },
      },
    },
  ]);

  // Get daily revenue for last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const dailyRevenue = await Transaction.aggregate([
    {
      $match: {
        type: 'PLATFORM_FEE',
        status: 'SUCCESS',
        createdAt: { $gte: thirtyDaysAgo },
      },
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' },
        },
        totalFees: { $sum: '$amount' },
        transactionCount: { $sum: 1 },
      },
    },
    {
      $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 },
    },
  ]);

  // Get top fee payers (freelancers)
  const topFreelancers = await Transaction.aggregate([
    {
      $match: {
        type: 'PLATFORM_FEE',
        status: 'SUCCESS',
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: '$userId',
        totalFeesPaid: { $sum: '$amount' },
        transactionCount: { $sum: 1 },
      },
    },
    {
      $sort: { totalFeesPaid: -1 },
    },
    {
      $limit: 10,
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user',
      },
    },
    {
      $unwind: '$user',
    },
    {
      $project: {
        _id: 1,
        totalFeesPaid: 1,
        transactionCount: 1,
        'user.name': 1,
        'user.email': 1,
        'user.avatar': 1,
      },
    },
  ]);

  // Format monthly data with labels
  const formattedMonthly = monthlyRevenue.map(item => ({
    year: item._id.year,
    month: item._id.month,
    label: new Date(item._id.year, item._id.month - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
    totalFees: item.totalFees,
    transactionCount: item.transactionCount,
    avgFee: Math.round(item.avgFee),
  }));

  // Format daily data
  const formattedDaily = dailyRevenue.map(item => ({
    date: new Date(item._id.year, item._id.month - 1, item._id.day).toISOString().split('T')[0],
    totalFees: item.totalFees,
    transactionCount: item.transactionCount,
  }));

  res.status(200).json({
    success: true,
    data: {
      summary: {
        totalFeesCollected: platformWallet.totalFeesCollected,
        availableBalance: platformWallet.availableBalance,
        totalWithdrawn: platformWallet.totalWithdrawn,
        totalTransactions: platformWallet.totalTransactions,
        platformFeePercentage: PLATFORM_FEE.percentage,
      },
      monthly: formattedMonthly,
      daily: formattedDaily,
      byPaymentMethod: revenueByMethod,
      topFreelancers,
    },
  });
});

// Get all escrows (admin)
export const getAllEscrows = asyncHandler(async (req, res) => {
  const filters = {
    status: req.query.status,
    clientId: req.query.clientId,
    freelancerId: req.query.freelancerId,
    minAmount: req.query.minAmount ? parseFloat(req.query.minAmount) : undefined,
    maxAmount: req.query.maxAmount ? parseFloat(req.query.maxAmount) : undefined,
  };

  const pagination = {
    page: parseInt(req.query.page) || 1,
    limit: parseInt(req.query.limit) || 20,
  };

  const result = await escrowService.getAllEscrows(filters, pagination);

  res.status(200).json({
    success: true,
    data: result,
  });
});

// Get escrow summary with fee breakdown
export const getEscrowSummary = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const summary = await escrowService.getEscrowSummary(id);

  res.status(200).json({
    success: true,
    data: summary,
  });
});

// Resolve dispute (admin)
export const resolveDispute = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { resolution, freelancerPercentage } = req.body;
  const adminId = req.user.id;

  // Validate resolution type
  if (!['RELEASE_TO_FREELANCER', 'REFUND_TO_CLIENT', 'SPLIT'].includes(resolution)) {
    throw createAppError('Invalid resolution type', 400);
  }

  const result = await escrowService.resolveDispute(id, adminId, resolution, {
    freelancerPercentage,
  });

  await createAuditLog({
    adminId,
    action: 'DISPUTE_RESOLVED',
    targetType: 'Escrow',
    targetId: id,
    details: { resolution, freelancerPercentage },
  });

  res.status(200).json({
    success: true,
    data: result,
    message: `Dispute resolved: ${resolution}`,
  });
});

// Get all transactions (admin)
export const getAllTransactions = asyncHandler(async (req, res) => {
  const filters = req.query;
  const { page = 1, limit = 50 } = filters;

  const skip = (page - 1) * limit;
  const query = {};

  if (filters.userId) query.userId = filters.userId;
  if (filters.type) query.type = filters.type;
  if (filters.status) query.status = filters.status;
  if (filters.paymentMethod) query.paymentMethod = filters.paymentMethod;
  if (filters.startDate || filters.endDate) {
    query.createdAt = {};
    if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
    if (filters.endDate) query.createdAt.$lte = new Date(filters.endDate);
  }

  const [transactions, total] = await Promise.all([
    Transaction.find(query)
      .populate('userId', 'name email')
      .populate('escrowId', 'amount status')
      .populate('contractId', 'title')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Transaction.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    data: {
      transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
    },
  });
});

// Get all withdrawals (admin)
export const getAllWithdrawals = asyncHandler(async (req, res) => {
  const filters = req.query;
  const { page = 1, limit = 50, status } = filters;

  const query = {};
  if (status) query.status = status;
  if (filters.userId) query.userId = filters.userId;

  const skip = (page - 1) * limit;

  const WithdrawalRequest = (await import('../../../models/WithdrawalRequest.js')).default;
  const [withdrawals, total] = await Promise.all([
    WithdrawalRequest.find(query)
      .populate('user', 'name email')
      .populate('processor', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    WithdrawalRequest.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    data: {
      withdrawals,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
    },
  });
});

// Process withdrawal (admin)
export const processWithdrawal = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const adminId = req.user.id;

  const withdrawal = await withdrawalService.processWithdrawal(id, adminId);

  res.status(200).json({
    success: true,
    data: withdrawal,
    message: 'Withdrawal processed successfully',
  });
});

// Reject withdrawal (admin)
export const rejectWithdrawal = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const adminId = req.user.id;

  const withdrawal = await withdrawalService.rejectWithdrawal(id, adminId, reason);

  res.status(200).json({
    success: true,
    data: withdrawal,
    message: 'Withdrawal rejected successfully',
  });
});

// Get escrow details (admin)
export const getEscrowDetails = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const escrow = await escrowService.getEscrowById(id);

  res.status(200).json({
    success: true,
    data: escrow,
  });
});

// Manual escrow release (admin)
export const manualEscrowRelease = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { partialAmount, toUserId } = req.body;
  const adminId = req.user.id;

  const escrow = await escrowService.adminReleaseEscrow(id, adminId, {
    partialAmount,
    toUserId,
  });

  res.status(200).json({
    success: true,
    data: escrow,
    message: 'Escrow released successfully',
  });
});

// Manual escrow refund (admin)
export const manualEscrowRefund = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const adminId = req.user.id;

  const escrow = await escrowService.adminRefundEscrow(id, adminId, reason);

  res.status(200).json({
    success: true,
    data: escrow,
    message: 'Escrow refunded successfully',
  });
});

// Get escrows by contract (admin)
export const getContractEscrows = asyncHandler(async (req, res) => {
  const { contractId } = req.params;

  const escrows = await escrowService.getEscrowByContract(contractId);

  res.status(200).json({
    success: true,
    data: escrows,
  });
});

// Get pending withdrawals (admin)
export const getPendingWithdrawals = asyncHandler(async (req, res) => {
  const withdrawals = await withdrawalService.getPendingWithdrawals();

  res.status(200).json({
    success: true,
    data: withdrawals,
  });
});

// Get payment mode (admin)
export const getPaymentMode = asyncHandler(async (req, res) => {
  const mode = await paymentModeService.getMode();
  const isTesting = await paymentModeService.isTestingMode();

  res.status(200).json({
    success: true,
    data: {
      mode,
      isTesting,
    },
  });
});

// Update payment mode (admin)
export const updatePaymentMode = asyncHandler(async (req, res) => {
  const { mode } = req.body;
  const adminId = req.user.id;

  // Validate mode
  if (!mode || !['testing', 'production'].includes(mode)) {
    throw createAppError('Invalid payment mode. Must be "testing" or "production"', 400);
  }

  // Get previous mode before update
  const previousMode = await paymentModeService.getMode();

  // Update environment variable in database
  const envService = (await import('../../../services/env/env.service.js')).default;
  await envService.setVariable(
    'PAYMENT_MODE',
    mode,
    {
      description: 'Payment system mode: testing or production',
      category: 'payment',
      isEncrypted: false,
      isPublic: false,
    },
    adminId
  );

  // Refresh environment cache
  await refreshEnvFromDatabase();
  
  // Audit log
  await createAuditLog({
    adminId: adminId,
    action: 'PAYMENT_MODE_UPDATED',
    targetType: 'System',
    targetId: null,
    details: {
      mode,
      previousMode,
    },
  });

  res.status(200).json({
    success: true,
    data: {
      mode,
      isTesting: mode === 'testing',
    },
    message: `Payment mode updated to ${mode}`,
  });
});

// ========================================
// PLATFORM WALLET WITHDRAWAL (Admin)
// ========================================

/**
 * Get platform wallet balance and withdrawal history
 */
export const getPlatformWalletDetails = asyncHandler(async (req, res) => {
  const platformWallet = await PlatformWallet.getWallet();
  const withdrawalHistory = await PlatformWithdrawal.getHistory({}, { page: 1, limit: 10 });
  const pendingWithdrawals = await PlatformWithdrawal.getPending();

  res.status(200).json({
    success: true,
    data: {
      wallet: {
        availableBalance: platformWallet.availableBalance,
        totalFeesCollected: platformWallet.totalFeesCollected,
        totalWithdrawn: platformWallet.totalWithdrawn,
        totalTransactions: platformWallet.totalTransactions,
        lastFeeCollectedAt: platformWallet.lastFeeCollectedAt,
      },
      recentWithdrawals: withdrawalHistory.withdrawals,
      pendingWithdrawals,
    },
  });
});

/**
 * Create platform wallet withdrawal request
 */
export const createPlatformWithdrawal = asyncHandler(async (req, res) => {
  const adminId = req.user.id;
  const { amount, paymentMethod, accountDetails, notes } = req.body;

  // Validate amount
  if (!amount || amount <= 0) {
    throw createAppError('Amount must be greater than zero', 400);
  }

  if (amount < 1000) {
    throw createAppError('Minimum withdrawal amount is Rs. 1,000', 400);
  }

  // Validate payment method
  if (!['JAZZCASH', 'EASYPAISA', 'BANK_TRANSFER'].includes(paymentMethod)) {
    throw createAppError('Invalid payment method', 400);
  }

  // Validate account details
  if (!accountDetails?.accountNumber || !accountDetails?.accountTitle) {
    throw createAppError('Account number and title are required', 400);
  }

  if (paymentMethod === 'BANK_TRANSFER' && !accountDetails?.bankName) {
    throw createAppError('Bank name is required for bank transfers', 400);
  }

  // Check platform wallet balance
  const platformWallet = await PlatformWallet.getWallet();
  if (platformWallet.availableBalance < amount) {
    throw createAppError(
      `Insufficient platform balance. Available: Rs. ${platformWallet.availableBalance.toLocaleString()}`,
      400
    );
  }

  // Start MongoDB session for atomic operation
  const session = await mongoose.startSession();
  
  try {
    let withdrawal;

    await session.withTransaction(async () => {
      // Record withdrawal from platform wallet
      await PlatformWallet.recordWithdrawal(amount, session);

      // Get updated balance
      const updatedWallet = await PlatformWallet.findOne({ identifier: 'main' }).session(session);

      // Create withdrawal record
      [withdrawal] = await PlatformWithdrawal.create([{
        adminId,
        amount,
        paymentMethod,
        accountDetails,
        notes,
        status: 'PENDING',
        platformBalanceBefore: platformWallet.availableBalance,
        platformBalanceAfter: updatedWallet.availableBalance,
      }], { session });
    });

    // Audit log
    await createAuditLog({
      adminId,
      action: 'PLATFORM_WITHDRAWAL_CREATED',
      targetType: 'PlatformWithdrawal',
      targetId: withdrawal._id,
      details: {
        amount,
        paymentMethod,
        accountNumber: accountDetails.accountNumber.slice(-4).padStart(accountDetails.accountNumber.length, '*'),
      },
    });

    res.status(201).json({
      success: true,
      data: withdrawal,
      message: `Withdrawal of Rs. ${amount.toLocaleString()} has been initiated`,
    });
  } catch (error) {
    throw createAppError(`Failed to create withdrawal: ${error.message}`, 500);
  } finally {
    await session.endSession();
  }
});

/**
 * Process platform wallet withdrawal (execute the actual transfer)
 */
export const processPlatformWithdrawal = asyncHandler(async (req, res) => {
  const adminId = req.user.id;
  const { id } = req.params;

  const withdrawal = await PlatformWithdrawal.findById(id);
  if (!withdrawal) {
    throw createAppError('Withdrawal not found', 404);
  }

  if (withdrawal.status !== 'PENDING') {
    throw createAppError(`Cannot process withdrawal in ${withdrawal.status} status`, 400);
  }

  // Mark as processing
  await withdrawal.markProcessing();

  try {
    let result;
    const withdrawalData = {
      amount: withdrawal.amount,
      accountNumber: withdrawal.accountDetails.accountNumber,
      phoneNumber: withdrawal.accountDetails.phoneNumber,
      cnic: withdrawal.accountDetails.cnic,
      accountTitle: withdrawal.accountDetails.accountTitle,
      bankName: withdrawal.accountDetails.bankName,
    };

    // Process based on payment method
    switch (withdrawal.paymentMethod) {
      case 'JAZZCASH':
        result = await jazzCashService.processWithdrawal(withdrawalData);
        break;
      case 'EASYPAISA':
        result = await easypaisaService.processWithdrawal(withdrawalData);
        break;
      case 'BANK_TRANSFER':
        // Bank transfers are processed manually - mark as completed directly
        result = { success: true, transactionId: `BANK-${Date.now()}` };
        break;
      default:
        throw createAppError('Unsupported payment method', 400);
    }

    if (result.success) {
      await withdrawal.markCompleted(result.gatewayTransactionId || result.transactionId);

      // Audit log
      await createAuditLog({
        adminId,
        action: 'PLATFORM_WITHDRAWAL_COMPLETED',
        targetType: 'PlatformWithdrawal',
        targetId: withdrawal._id,
        details: {
          amount: withdrawal.amount,
          gatewayTransactionId: result.gatewayTransactionId || result.transactionId,
        },
      });

      res.status(200).json({
        success: true,
        data: withdrawal,
        message: 'Withdrawal processed successfully',
      });
    } else {
      throw createAppError(result.message || 'Gateway processing failed', 500);
    }
  } catch (error) {
    // Mark as failed and refund to platform wallet
    await withdrawal.markFailed(error.message);
    
    // Refund to platform wallet
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await PlatformWallet.findOneAndUpdate(
          { identifier: 'main' },
          {
            $inc: {
              availableBalance: withdrawal.amount,
              totalWithdrawn: -withdrawal.amount,
            },
          },
          { session }
        );
      });
    } finally {
      await session.endSession();
    }

    // Audit log
    await createAuditLog({
      adminId,
      action: 'PLATFORM_WITHDRAWAL_FAILED',
      targetType: 'PlatformWithdrawal',
      targetId: withdrawal._id,
      details: {
        amount: withdrawal.amount,
        error: error.message,
      },
    });

    throw createAppError(`Withdrawal failed: ${error.message}. Amount refunded to platform wallet.`, 500);
  }
});

/**
 * Cancel platform withdrawal (before processing)
 */
export const cancelPlatformWithdrawal = asyncHandler(async (req, res) => {
  const adminId = req.user.id;
  const { id } = req.params;
  const { reason } = req.body;

  const withdrawal = await PlatformWithdrawal.findById(id);
  if (!withdrawal) {
    throw createAppError('Withdrawal not found', 404);
  }

  if (withdrawal.status !== 'PENDING') {
    throw createAppError(`Cannot cancel withdrawal in ${withdrawal.status} status`, 400);
  }

  // Refund to platform wallet
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Add back to platform wallet
      await PlatformWallet.findOneAndUpdate(
        { identifier: 'main' },
        {
          $inc: {
            availableBalance: withdrawal.amount,
            totalWithdrawn: -withdrawal.amount,
          },
        },
        { session }
      );

      // Update withdrawal status
      withdrawal.status = 'CANCELLED';
      withdrawal.notes = reason || 'Cancelled by admin';
      await withdrawal.save({ session });
    });

    // Audit log
    await createAuditLog({
      adminId,
      action: 'PLATFORM_WITHDRAWAL_CANCELLED',
      targetType: 'PlatformWithdrawal',
      targetId: withdrawal._id,
      details: {
        amount: withdrawal.amount,
        reason,
      },
    });

    res.status(200).json({
      success: true,
      data: withdrawal,
      message: 'Withdrawal cancelled and amount refunded to platform wallet',
    });
  } catch (error) {
    throw createAppError(`Failed to cancel withdrawal: ${error.message}`, 500);
  } finally {
    await session.endSession();
  }
});

/**
 * Get platform withdrawal history
 */
export const getPlatformWithdrawalHistory = asyncHandler(async (req, res) => {
  const { status, startDate, endDate, page = 1, limit = 20 } = req.query;

  const filters = {};
  if (status) filters.status = status;
  if (startDate) filters.startDate = startDate;
  if (endDate) filters.endDate = endDate;

  const result = await PlatformWithdrawal.getHistory(filters, {
    page: parseInt(page),
    limit: parseInt(limit),
  });

  res.status(200).json({
    success: true,
    data: result,
  });
});

/**
 * Get payment gateway credentials status
 * Validates that all required credentials are configured for production mode
 */
export const getPaymentGatewayStatus = asyncHandler(async (req, res) => {
  const paymentMode = await paymentModeService.getPaymentMode();
  const isTestingMode = paymentMode === 'testing';

  // Get JazzCash credentials and validate
  const jazzCashCreds = jazzCashService.getCredentials();
  const jazzCashStatus = {
    name: 'JazzCash',
    configured: !!(jazzCashCreds.merchantId && jazzCashCreds.password && jazzCashCreds.integrationKey),
    sandbox: jazzCashCreds.sandbox,
    missingFields: [],
    warnings: [],
  };

  if (!jazzCashCreds.merchantId) jazzCashStatus.missingFields.push('JAZZCASH_MERCHANT_ID');
  if (!jazzCashCreds.password) jazzCashStatus.missingFields.push('JAZZCASH_PASSWORD');
  if (!jazzCashCreds.integrationKey) jazzCashStatus.missingFields.push('JAZZCASH_INTEGRATION_KEY');
  if (!jazzCashCreds.returnUrl) jazzCashStatus.warnings.push('JAZZCASH_RETURN_URL not set, using default');

  // Production-specific warnings
  if (!isTestingMode && jazzCashCreds.sandbox) {
    jazzCashStatus.warnings.push('Using sandbox credentials in production mode');
  }

  // Get Easypaisa credentials and validate
  const easypaisaCreds = easypaisaService.getCredentials();
  const easypaisaStatus = {
    name: 'Easypaisa',
    configured: !!(easypaisaCreds.merchantId && easypaisaCreds.storeId && easypaisaCreds.hashKey),
    sandbox: easypaisaCreds.sandbox,
    missingFields: [],
    warnings: [],
  };

  if (!easypaisaCreds.merchantId) easypaisaStatus.missingFields.push('EASYPAISA_MERCHANT_ID');
  if (!easypaisaCreds.storeId) easypaisaStatus.missingFields.push('EASYPAISA_STORE_ID');
  if (!easypaisaCreds.hashKey) easypaisaStatus.missingFields.push('EASYPAISA_HASH_KEY');
  if (!easypaisaCreds.returnUrl) easypaisaStatus.warnings.push('EASYPAISA_RETURN_URL not set, using default');

  // Production-specific warnings
  if (!isTestingMode && easypaisaCreds.sandbox) {
    easypaisaStatus.warnings.push('Using sandbox credentials in production mode');
  }

  // Bank Transfer status (typically manual, so always "configured")
  const bankTransferStatus = {
    name: 'Bank Transfer',
    configured: true,
    sandbox: false,
    missingFields: [],
    warnings: [],
    note: 'Manual processing - no gateway credentials required',
  };

  // Overall readiness
  const allConfigured = jazzCashStatus.configured && easypaisaStatus.configured;
  const hasWarnings = 
    jazzCashStatus.warnings.length > 0 || 
    easypaisaStatus.warnings.length > 0;
  
  const productionReady = allConfigured && !isTestingMode && 
    !jazzCashCreds.sandbox && !easypaisaCreds.sandbox;

  res.status(200).json({
    success: true,
    data: {
      paymentMode,
      isTestingMode,
      productionReady,
      hasWarnings,
      gateways: {
        jazzcash: jazzCashStatus,
        easypaisa: easypaisaStatus,
        bankTransfer: bankTransferStatus,
      },
      recommendations: getGatewayRecommendations(
        isTestingMode, 
        jazzCashStatus, 
        easypaisaStatus
      ),
    },
  });
});

/**
 * Helper to generate recommendations based on gateway status
 */
function getGatewayRecommendations(isTestingMode, jazzCash, easypaisa) {
  const recommendations = [];

  if (!jazzCash.configured) {
    recommendations.push({
      priority: 'high',
      gateway: 'JazzCash',
      message: 'Configure JazzCash credentials in Admin Settings to enable JazzCash payments',
      fields: jazzCash.missingFields,
    });
  }

  if (!easypaisa.configured) {
    recommendations.push({
      priority: 'high',
      gateway: 'Easypaisa',
      message: 'Configure Easypaisa credentials in Admin Settings to enable Easypaisa payments',
      fields: easypaisa.missingFields,
    });
  }

  if (!isTestingMode && jazzCash.sandbox) {
    recommendations.push({
      priority: 'critical',
      gateway: 'JazzCash',
      message: 'Switch to production JazzCash credentials before going live',
    });
  }

  if (!isTestingMode && easypaisa.sandbox) {
    recommendations.push({
      priority: 'critical',
      gateway: 'Easypaisa',
      message: 'Switch to production Easypaisa credentials before going live',
    });
  }

  if (isTestingMode && jazzCash.configured && easypaisa.configured) {
    recommendations.push({
      priority: 'info',
      message: 'All gateways configured. Switch to production mode when ready to process real payments.',
    });
  }

  return recommendations;
}

