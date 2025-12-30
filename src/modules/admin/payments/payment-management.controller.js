import paymentService from '../../payments/payment.service.js';
import withdrawalService from '../../payments/withdrawal.service.js';
import escrowService from '../../payments/escrow.service.js';
import Transaction from '../../../models/Transaction.js';
import { asyncHandler } from '../../../core/utils/index.js';
import { createAppError } from '../../../core/errors/index.js';
import paymentModeService from '../../../services/paymentGateways/paymentMode.service.js';
import { refreshEnvFromDatabase } from '../../../core/utils/envLoader.js';
import { createAuditLog } from '../../../core/utils/auditLogger.js';

/**
 * Admin Payment Management Controller
 * Handles admin operations for payments, withdrawals, and escrows
 */

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

  // Get previous mode before update
  const previousMode = await paymentModeService.getMode();
  
  // Audit log
  await createAuditLog({
    adminId: adminId,
    action: 'PAYMENT_MODE_UPDATED',
    targetType: 'System',
    targetId: 'payment-mode',
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

