import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
  {
    // Idempotency key to prevent duplicate transactions
    idempotencyKey: {
      type: String,
      unique: true,
      sparse: true, // Allow null but enforce uniqueness when present
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Counter-party user (for transfers between users)
    counterPartyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    type: {
      type: String,
      enum: [
        'DEPOSIT',
        'WITHDRAWAL', 
        'ESCROW_FUND',
        'ESCROW_RELEASE',
        'ESCROW_REFUND',
        'PLATFORM_FEE',
        'REFUND',
        'FEE',
        'ADJUSTMENT', // Admin adjustments
        'BONUS', // Platform bonuses
      ],
      required: true,
      index: true,
    },
    // Direction of money flow
    direction: {
      type: String,
      enum: ['CREDIT', 'DEBIT'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isFinite,
        message: 'Amount must be a valid number',
      },
    },
    // Platform fee deducted (for escrow releases)
    platformFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Net amount after fees
    netAmount: {
      type: Number,
      min: 0,
    },
    // Fee percentage at time of transaction (for audit trail)
    feePercentage: {
      type: Number,
      default: 5,
      min: 0,
      max: 100,
    },
    currency: {
      type: String,
      default: 'PKR',
      enum: ['PKR'],
    },
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED', 'REVERSED'],
      default: 'PENDING',
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ['JAZZCASH', 'EASYPAISA', 'BANK_TRANSFER', 'WALLET', 'SYSTEM'],
      default: 'WALLET',
    },
    gatewayTransactionId: {
      type: String,
      index: true,
    },
    // Gateway response data
    gatewayResponse: {
      type: mongoose.Schema.Types.Mixed,
    },
    escrowId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Escrow',
      index: true,
    },
    contractId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contract',
      index: true,
    },
    // Related withdrawal request
    withdrawalRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WithdrawalRequest',
      index: true,
    },
    description: {
      type: String,
      maxlength: 500,
    },
    // Internal notes (admin only)
    internalNotes: {
      type: String,
      maxlength: 1000,
    },
    failureReason: {
      type: String,
    },
    // IP address for security/audit
    ipAddress: {
      type: String,
    },
    // User agent for audit
    userAgent: {
      type: String,
    },
    // Balance before this transaction
    balanceBefore: {
      type: Number,
    },
    // Balance after this transaction
    balanceAfter: {
      type: Number,
    },
    // Processing timestamps
    processedAt: {
      type: Date,
    },
    completedAt: {
      type: Date,
    },
    // Reversal tracking
    reversedAt: {
      type: Date,
    },
    reversalTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
    },
    reversalReason: {
      type: String,
    },
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for efficient querying
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ userId: 1, type: 1, status: 1 });
transactionSchema.index({ gatewayTransactionId: 1 });
transactionSchema.index({ escrowId: 1 });
transactionSchema.index({ contractId: 1 });
transactionSchema.index({ status: 1, createdAt: -1 });
transactionSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
transactionSchema.index({ counterPartyId: 1, createdAt: -1 });
transactionSchema.index({ withdrawalRequestId: 1 });

// Pre-save middleware to calculate netAmount
transactionSchema.pre('save', function (next) {
  if (this.isModified('amount') || this.isModified('platformFee')) {
    this.netAmount = this.amount - (this.platformFee || 0);
  }
  next();
});

// Virtual populate for user
transactionSchema.virtual('user', {
  ref: 'User',
  localField: 'userId',
  foreignField: '_id',
  justOne: true,
});

// Virtual populate for counterParty
transactionSchema.virtual('counterParty', {
  ref: 'User',
  localField: 'counterPartyId',
  foreignField: '_id',
  justOne: true,
});

// Virtual populate for escrow
transactionSchema.virtual('escrow', {
  ref: 'Escrow',
  localField: 'escrowId',
  foreignField: '_id',
  justOne: true,
});

// Virtual populate for contract
transactionSchema.virtual('contract', {
  ref: 'Contract',
  localField: 'contractId',
  foreignField: '_id',
  justOne: true,
});

// Instance method to mark transaction as success
transactionSchema.methods.markSuccess = async function (session = null) {
  this.status = 'SUCCESS';
  this.completedAt = new Date();
  const options = session ? { session } : {};
  return this.save(options);
};

// Instance method to mark transaction as processing
transactionSchema.methods.markProcessing = async function (session = null) {
  this.status = 'PROCESSING';
  this.processedAt = new Date();
  const options = session ? { session } : {};
  return this.save(options);
};

// Instance method to mark transaction as failed
transactionSchema.methods.markFailed = async function (reason, session = null) {
  this.status = 'FAILED';
  if (reason) {
    this.failureReason = reason;
  }
  this.completedAt = new Date();
  const options = session ? { session } : {};
  return this.save(options);
};

// Instance method to cancel transaction
transactionSchema.methods.cancel = async function (session = null) {
  if (this.status === 'SUCCESS') {
    throw new Error('Cannot cancel a successful transaction');
  }
  this.status = 'CANCELLED';
  this.completedAt = new Date();
  const options = session ? { session } : {};
  return this.save(options);
};

// Instance method to reverse transaction
transactionSchema.methods.reverse = async function (reason, reversalTxnId, session = null) {
  if (this.status !== 'SUCCESS') {
    throw new Error('Can only reverse successful transactions');
  }
  this.status = 'REVERSED';
  this.reversedAt = new Date();
  this.reversalReason = reason;
  this.reversalTransactionId = reversalTxnId;
  const options = session ? { session } : {};
  return this.save(options);
};

// Static method to find by idempotency key
transactionSchema.statics.findByIdempotencyKey = async function (idempotencyKey) {
  return this.findOne({ idempotencyKey });
};

// Static method to get user transactions with filters
transactionSchema.statics.getUserTransactions = async function (userId, filters = {}, options = {}) {
  const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = -1 } = options;
  const skip = (page - 1) * limit;
  
  const query = { userId, ...filters };
  
  const [transactions, total] = await Promise.all([
    this.find(query)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit)
      .populate('contract', 'title')
      .populate('counterParty', 'firstName lastName'),
    this.countDocuments(query),
  ]);
  
  return {
    transactions,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

// Static method to create transaction with idempotency check
transactionSchema.statics.createWithIdempotency = async function (data, session = null) {
  // Check if transaction already exists with this idempotency key
  if (data.idempotencyKey) {
    const existing = await this.findByIdempotencyKey(data.idempotencyKey);
    if (existing) {
      return { transaction: existing, isExisting: true };
    }
  }
  
  const options = session ? { session } : {};
  const [transaction] = await this.create([data], options);
  return { transaction, isExisting: false };
};

// Static method to get transaction summary for user
transactionSchema.statics.getUserSummary = async function (userId) {
  const result = await this.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId), status: 'SUCCESS' } },
    {
      $group: {
        _id: '$type',
        totalAmount: { $sum: '$amount' },
        totalFees: { $sum: '$platformFee' },
        count: { $sum: 1 },
      },
    },
  ]);
  
  return result.reduce((acc, item) => {
    acc[item._id] = {
      totalAmount: item.totalAmount,
      totalFees: item.totalFees,
      count: item.count,
    };
    return acc;
  }, {});
};

const Transaction = mongoose.model('Transaction', transactionSchema);

export default Transaction;

