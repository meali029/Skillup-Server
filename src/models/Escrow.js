import mongoose from 'mongoose';

const escrowSchema = new mongoose.Schema(
  {
    contractId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contract',
      required: false, // Optional initially for contract-level escrow created before contract
      index: true,
    },
    milestoneId: {
      type: String,
      required: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    freelancerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Total amount funded into escrow
    amount: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isFinite,
        message: 'Amount must be a valid number',
      },
    },
    // Platform fee (5%) calculated at funding time
    platformFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Fee percentage at time of escrow creation (for audit)
    feePercentage: {
      type: Number,
      default: 5,
      min: 0,
      max: 100,
    },
    // Amount freelancer will receive (amount - platformFee)
    freelancerAmount: {
      type: Number,
      min: 0,
    },
    currency: {
      type: String,
      default: 'PKR',
      enum: ['PKR'],
    },
    status: {
      type: String,
      enum: ['CREATED', 'FUNDED', 'LOCKED', 'RELEASED', 'REFUNDED', 'DISPUTED', 'EXPIRED', 'CANCELLED'],
      default: 'CREATED',
      index: true,
    },
    // Expiry for unfunded escrows (auto-cleanup)
    expiresAt: {
      type: Date,
    },
    fundedAt: {
      type: Date,
    },
    lockedAt: {
      type: Date,
    },
    releasedAt: {
      type: Date,
    },
    refundedAt: {
      type: Date,
    },
    // Transaction references for complete audit trail
    fundTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
    },
    releaseTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
    },
    feeTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
    },
    refundTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
    },
    // Legacy field for backward compatibility
    transactionId: {
      type: String,
    },
    gatewayTransactionId: {
      type: String,
    },
    paymentMethod: {
      type: String,
      enum: ['JAZZCASH', 'EASYPAISA', 'BANK_TRANSFER', 'WALLET', 'SYSTEM'],
      default: 'WALLET',
    },
    // Release notes/reason
    releaseNotes: {
      type: String,
      maxlength: 1000,
    },
    // Refund reason
    refundReason: {
      type: String,
      maxlength: 1000,
    },
    // Dispute details
    disputeReason: {
      type: String,
    },
    disputedAt: {
      type: Date,
    },
    disputeResolvedAt: {
      type: Date,
    },
    disputeResolution: {
      type: String,
      enum: ['RELEASE_TO_FREELANCER', 'REFUND_TO_CLIENT', 'SPLIT', 'PENDING'],
    },
    // Admin who handled dispute (if any)
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
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

// Pre-save middleware to calculate freelancerAmount
escrowSchema.pre('save', function (next) {
  if (this.isModified('amount') || this.isModified('platformFee')) {
    this.freelancerAmount = this.amount - (this.platformFee || 0);
  }
  next();
});

// Indexes for efficient querying
escrowSchema.index({ contractId: 1, milestoneId: 1 });
escrowSchema.index({ clientId: 1, status: 1 });
escrowSchema.index({ freelancerId: 1, status: 1 });
escrowSchema.index({ status: 1, createdAt: -1 });
escrowSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index for auto-cleanup

// Virtual populate for contract
escrowSchema.virtual('contract', {
  ref: 'Contract',
  localField: 'contractId',
  foreignField: '_id',
  justOne: true,
});

// Virtual populate for client
escrowSchema.virtual('client', {
  ref: 'User',
  localField: 'clientId',
  foreignField: '_id',
  justOne: true,
});

// Virtual populate for freelancer
escrowSchema.virtual('freelancer', {
  ref: 'User',
  localField: 'freelancerId',
  foreignField: '_id',
  justOne: true,
});

// Virtual populate for fund transaction
escrowSchema.virtual('fundTransaction', {
  ref: 'Transaction',
  localField: 'fundTransactionId',
  foreignField: '_id',
  justOne: true,
});

// Virtual populate for release transaction
escrowSchema.virtual('releaseTransaction', {
  ref: 'Transaction',
  localField: 'releaseTransactionId',
  foreignField: '_id',
  justOne: true,
});

// Instance method to fund escrow
escrowSchema.methods.fund = async function (fundTransactionId, paymentMethod, session = null) {
  if (this.status !== 'CREATED') {
    throw new Error(`Cannot fund escrow in ${this.status} status`);
  }
  this.status = 'FUNDED';
  this.fundedAt = new Date();
  this.fundTransactionId = fundTransactionId;
  this.paymentMethod = paymentMethod;
  // Clear expiry since it's now funded
  this.expiresAt = null;
  const options = session ? { session } : {};
  return this.save(options);
};

// Instance method to lock escrow
escrowSchema.methods.lock = async function (session = null) {
  if (this.status !== 'FUNDED') {
    throw new Error(`Cannot lock escrow in ${this.status} status`);
  }
  this.status = 'LOCKED';
  this.lockedAt = new Date();
  const options = session ? { session } : {};
  return this.save(options);
};

// Instance method to release escrow
escrowSchema.methods.release = async function (releaseTransactionId, feeTransactionId, notes = '', session = null) {
  if (!['LOCKED', 'FUNDED'].includes(this.status)) {
    throw new Error(`Cannot release escrow in ${this.status} status`);
  }
  this.status = 'RELEASED';
  this.releasedAt = new Date();
  this.releaseTransactionId = releaseTransactionId;
  this.feeTransactionId = feeTransactionId;
  if (notes) {
    this.releaseNotes = notes;
  }
  const options = session ? { session } : {};
  return this.save(options);
};

// Instance method to refund escrow
escrowSchema.methods.refund = async function (refundTransactionId, reason, session = null) {
  if (!['FUNDED', 'LOCKED', 'DISPUTED'].includes(this.status)) {
    throw new Error(`Cannot refund escrow in ${this.status} status`);
  }
  this.status = 'REFUNDED';
  this.refundedAt = new Date();
  this.refundTransactionId = refundTransactionId;
  if (reason) {
    this.refundReason = reason;
  }
  const options = session ? { session } : {};
  return this.save(options);
};

// Instance method to freeze escrow (for disputes)
escrowSchema.methods.freeze = async function (reason, session = null) {
  if (!['FUNDED', 'LOCKED'].includes(this.status)) {
    throw new Error(`Cannot freeze escrow in ${this.status} status`);
  }
  this.status = 'DISPUTED';
  this.disputedAt = new Date();
  this.disputeReason = reason;
  this.disputeResolution = 'PENDING';
  const options = session ? { session } : {};
  return this.save(options);
};

// Instance method to resolve dispute
escrowSchema.methods.resolveDispute = async function (resolution, resolvedBy, session = null) {
  if (this.status !== 'DISPUTED') {
    throw new Error(`Cannot resolve non-disputed escrow`);
  }
  this.disputeResolvedAt = new Date();
  this.disputeResolution = resolution;
  this.resolvedBy = resolvedBy;
  // Status will be updated by the resolution handler (RELEASED or REFUNDED)
  const options = session ? { session } : {};
  return this.save(options);
};

// Instance method to cancel escrow
escrowSchema.methods.cancel = async function (reason, session = null) {
  if (!['CREATED'].includes(this.status)) {
    throw new Error(`Cannot cancel escrow in ${this.status} status`);
  }
  this.status = 'CANCELLED';
  if (reason) {
    this.metadata = this.metadata || new Map();
    this.metadata.set('cancelReason', reason);
  }
  const options = session ? { session } : {};
  return this.save(options);
};

// Static method to get escrows by contract
escrowSchema.statics.getByContract = async function (contractId) {
  return this.find({ contractId }).sort({ createdAt: -1 });
};

// Static method to get escrow by milestone
escrowSchema.statics.getByMilestone = async function (contractId, milestoneId) {
  return this.findOne({ contractId, milestoneId });
};

// Static method to get active escrows for client
escrowSchema.statics.getActiveByClient = async function (clientId) {
  return this.find({ 
    clientId, 
    status: { $in: ['CREATED', 'FUNDED', 'LOCKED'] }
  }).sort({ createdAt: -1 });
};

// Static method to get total locked amount for client
escrowSchema.statics.getTotalLockedForClient = async function (clientId) {
  const result = await this.aggregate([
    {
      $match: {
        clientId: new mongoose.Types.ObjectId(clientId),
        status: { $in: ['FUNDED', 'LOCKED', 'DISPUTED'] },
      },
    },
    {
      $group: {
        _id: null,
        totalLocked: { $sum: '$amount' },
      },
    },
  ]);
  return result[0]?.totalLocked || 0;
};

// Static method to get expired unfunded escrows (for cleanup job)
escrowSchema.statics.getExpiredUnfunded = async function () {
  return this.find({
    status: 'CREATED',
    expiresAt: { $lt: new Date() },
  });
};

const Escrow = mongoose.model('Escrow', escrowSchema);

export default Escrow;

