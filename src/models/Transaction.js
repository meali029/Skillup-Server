import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['DEPOSIT', 'WITHDRAWAL', 'ESCROW_FUND', 'ESCROW_RELEASE', 'REFUND', 'FEE'],
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['PENDING', 'SUCCESS', 'FAILED', 'CANCELLED'],
      default: 'PENDING',
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ['JAZZCASH', 'EASYPAISA', 'BANK_TRANSFER', 'STRIPE'],
    },
    gatewayTransactionId: {
      type: String,
      index: true,
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
    description: {
      type: String,
    },
    failureReason: {
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

// Virtual populate for user
transactionSchema.virtual('user', {
  ref: 'User',
  localField: 'userId',
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
transactionSchema.methods.markSuccess = async function () {
  this.status = 'SUCCESS';
  return this.save();
};

// Instance method to mark transaction as failed
transactionSchema.methods.markFailed = async function (reason) {
  this.status = 'FAILED';
  if (reason) {
    this.failureReason = reason;
  }
  return this.save();
};

// Instance method to cancel transaction
transactionSchema.methods.cancel = async function () {
  if (this.status === 'SUCCESS') {
    throw new Error('Cannot cancel a successful transaction');
  }
  this.status = 'CANCELLED';
  return this.save();
};

// Static method to get user transactions with filters
transactionSchema.statics.getUserTransactions = async function (userId, filters = {}) {
  const query = { userId, ...filters };
  return this.find(query).sort({ createdAt: -1 });
};

const Transaction = mongoose.model('Transaction', transactionSchema);

export default Transaction;

