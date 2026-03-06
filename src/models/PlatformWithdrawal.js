import mongoose from 'mongoose';

/**
 * PlatformWithdrawal Model
 * 
 * Tracks admin withdrawals from the platform wallet (collected fees).
 * This is separate from user withdrawals (WithdrawalRequest model).
 */
const platformWithdrawalSchema = new mongoose.Schema(
  {
    // Admin who initiated the withdrawal
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Amount withdrawn
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    // Currency (PKR only)
    currency: {
      type: String,
      default: 'PKR',
      enum: ['PKR'],
    },
    // Withdrawal method
    paymentMethod: {
      type: String,
      required: true,
      enum: ['JAZZCASH', 'EASYPAISA', 'BANK_TRANSFER'],
    },
    // Account details for withdrawal
    accountDetails: {
      accountNumber: {
        type: String,
        required: true,
      },
      accountTitle: {
        type: String,
        required: true,
      },
      bankName: {
        type: String, // Required for bank transfers
      },
      phoneNumber: {
        type: String, // For JazzCash/Easypaisa
      },
      cnic: {
        type: String, // CNIC for verification
      },
    },
    // Status of withdrawal
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'],
      default: 'PENDING',
      index: true,
    },
    // Gateway transaction reference
    gatewayTransactionId: {
      type: String,
    },
    // Processing notes (for manual processing)
    notes: {
      type: String,
    },
    // Error message if failed
    errorMessage: {
      type: String,
    },
    // Timestamps
    processedAt: {
      type: Date,
    },
    completedAt: {
      type: Date,
    },
    // Balance before and after (for audit)
    platformBalanceBefore: {
      type: Number,
    },
    platformBalanceAfter: {
      type: Number,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for efficient queries
platformWithdrawalSchema.index({ status: 1, createdAt: -1 });
platformWithdrawalSchema.index({ adminId: 1, createdAt: -1 });

/**
 * Instance method: Mark as processing
 */
platformWithdrawalSchema.methods.markProcessing = async function () {
  this.status = 'PROCESSING';
  this.processedAt = new Date();
  await this.save();
  return this;
};

/**
 * Instance method: Mark as completed
 */
platformWithdrawalSchema.methods.markCompleted = async function (gatewayTransactionId) {
  this.status = 'COMPLETED';
  this.completedAt = new Date();
  if (gatewayTransactionId) {
    this.gatewayTransactionId = gatewayTransactionId;
  }
  await this.save();
  return this;
};

/**
 * Instance method: Mark as failed
 */
platformWithdrawalSchema.methods.markFailed = async function (errorMessage) {
  this.status = 'FAILED';
  this.errorMessage = errorMessage;
  await this.save();
  return this;
};

/**
 * Static: Get pending withdrawals
 */
platformWithdrawalSchema.statics.getPending = async function () {
  return this.find({ status: 'PENDING' })
    .populate('adminId', 'name email')
    .sort({ createdAt: -1 })
    .lean();
};

/**
 * Static: Get withdrawal history with pagination
 */
platformWithdrawalSchema.statics.getHistory = async function (filters = {}, pagination = {}) {
  const { status, startDate, endDate } = filters;
  const { page = 1, limit = 20 } = pagination;

  const query = {};
  if (status) query.status = status;
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  const skip = (page - 1) * limit;

  const [withdrawals, total] = await Promise.all([
    this.find(query)
      .populate('adminId', 'name email avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    this.countDocuments(query),
  ]);

  return {
    withdrawals,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

/**
 * Static: Get total withdrawn amount
 */
platformWithdrawalSchema.statics.getTotalWithdrawn = async function () {
  const result = await this.aggregate([
    { $match: { status: 'COMPLETED' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return result[0]?.total || 0;
};

const PlatformWithdrawal = mongoose.model('PlatformWithdrawal', platformWithdrawalSchema);

export default PlatformWithdrawal;
