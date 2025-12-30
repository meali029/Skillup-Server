import mongoose from 'mongoose';

const withdrawalRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      enum: ['JAZZCASH', 'EASYPAISA', 'BANK_TRANSFER'],
      required: true,
    },
    accountDetails: {
      // Encrypted payment details
      // accountNumber is required for all methods (phone number for mobile wallets)
      accountNumber: {
        type: String,
        required: true,
      },
      // accountName is only required for bank transfers
      accountName: {
        type: String,
        required: false, // Made optional - validation happens in service based on payment method
      },
      // For bank transfers
      bankName: {
        type: String,
        required: false, // Made optional - validation happens in service based on payment method
      },
      branchName: String,
      iban: String,
      swiftCode: String,
      // For JazzCash/Easypaisa
      phoneNumber: String,
      cnic: String,
    },
    status: {
      type: String,
      enum: ['REQUESTED', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED'],
      default: 'REQUESTED',
      index: true,
    },
    processedAt: {
      type: Date,
    },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    failureReason: {
      type: String,
    },
    transactionId: {
      type: String,
      index: true,
    },
    gatewayTransactionId: {
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
withdrawalRequestSchema.index({ userId: 1, createdAt: -1 });
withdrawalRequestSchema.index({ status: 1, createdAt: -1 });
withdrawalRequestSchema.index({ transactionId: 1 });

// Virtual populate for user
withdrawalRequestSchema.virtual('user', {
  ref: 'User',
  localField: 'userId',
  foreignField: '_id',
  justOne: true,
});

// Virtual populate for admin who processed
withdrawalRequestSchema.virtual('processor', {
  ref: 'User',
  localField: 'processedBy',
  foreignField: '_id',
  justOne: true,
});

// Instance method to mark as processing
withdrawalRequestSchema.methods.markProcessing = async function (adminId) {
  if (this.status !== 'REQUESTED') {
    throw new Error(`Cannot process withdrawal in ${this.status} status`);
  }
  this.status = 'PROCESSING';
  this.processedBy = adminId;
  return this.save();
};

// Instance method to mark as success
withdrawalRequestSchema.methods.markSuccess = async function (transactionId, gatewayTransactionId) {
  if (this.status !== 'PROCESSING') {
    throw new Error(`Cannot mark as success from ${this.status} status`);
  }
  this.status = 'SUCCESS';
  this.processedAt = new Date();
  this.transactionId = transactionId;
  if (gatewayTransactionId) {
    this.gatewayTransactionId = gatewayTransactionId;
  }
  return this.save();
};

// Instance method to mark as failed
withdrawalRequestSchema.methods.markFailed = async function (reason) {
  if (!['PROCESSING', 'REQUESTED'].includes(this.status)) {
    throw new Error(`Cannot mark as failed from ${this.status} status`);
  }
  this.status = 'FAILED';
  this.processedAt = new Date();
  if (reason) {
    this.failureReason = reason;
  }
  return this.save();
};

// Instance method to cancel withdrawal
withdrawalRequestSchema.methods.cancel = async function (userId) {
  if (this.userId.toString() !== userId.toString()) {
    throw new Error('Only the request owner can cancel');
  }
  if (!['REQUESTED', 'PROCESSING'].includes(this.status)) {
    throw new Error(`Cannot cancel withdrawal in ${this.status} status`);
  }
  this.status = 'CANCELLED';
  return this.save();
};

// Static method to get user withdrawals
withdrawalRequestSchema.statics.getUserWithdrawals = async function (userId, filters = {}) {
  const query = { userId, ...filters };
  return this.find(query).sort({ createdAt: -1 });
};

// Static method to get pending withdrawals (for admin)
withdrawalRequestSchema.statics.getPendingWithdrawals = async function () {
  return this.find({ status: 'REQUESTED' })
    .populate('user', 'name email')
    .sort({ createdAt: 1 });
};

const WithdrawalRequest = mongoose.model('WithdrawalRequest', withdrawalRequestSchema);

export default WithdrawalRequest;

