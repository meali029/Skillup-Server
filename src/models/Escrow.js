import mongoose from 'mongoose';

const escrowSchema = new mongoose.Schema(
  {
    contractId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contract',
      required: true,
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
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['CREATED', 'FUNDED', 'LOCKED', 'RELEASED', 'REFUNDED', 'DISPUTED'],
      default: 'CREATED',
      index: true,
    },
    fundedAt: {
      type: Date,
    },
    releasedAt: {
      type: Date,
    },
    refundedAt: {
      type: Date,
    },
    transactionId: {
      type: String,
    },
    gatewayTransactionId: {
      type: String,
    },
    paymentMethod: {
      type: String,
      enum: ['JAZZCASH', 'EASYPAISA', 'BANK_TRANSFER', 'STRIPE'],
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
escrowSchema.index({ contractId: 1, milestoneId: 1 });
escrowSchema.index({ clientId: 1, status: 1 });
escrowSchema.index({ freelancerId: 1, status: 1 });
escrowSchema.index({ status: 1, createdAt: -1 });

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

// Instance method to fund escrow
escrowSchema.methods.fund = async function (transactionId, paymentMethod) {
  if (this.status !== 'CREATED') {
    throw new Error(`Cannot fund escrow in ${this.status} status`);
  }
  this.status = 'FUNDED';
  this.fundedAt = new Date();
  this.transactionId = transactionId;
  this.paymentMethod = paymentMethod;
  return this.save();
};

// Instance method to lock escrow
escrowSchema.methods.lock = async function () {
  if (this.status !== 'FUNDED') {
    throw new Error(`Cannot lock escrow in ${this.status} status`);
  }
  this.status = 'LOCKED';
  return this.save();
};

// Instance method to release escrow
escrowSchema.methods.release = async function () {
  if (!['LOCKED', 'FUNDED'].includes(this.status)) {
    throw new Error(`Cannot release escrow in ${this.status} status`);
  }
  this.status = 'RELEASED';
  this.releasedAt = new Date();
  return this.save();
};

// Instance method to refund escrow
escrowSchema.methods.refund = async function (reason) {
  if (!['FUNDED', 'LOCKED', 'DISPUTED'].includes(this.status)) {
    throw new Error(`Cannot refund escrow in ${this.status} status`);
  }
  this.status = 'REFUNDED';
  this.refundedAt = new Date();
  if (reason) {
    this.metadata = this.metadata || new Map();
    this.metadata.set('refundReason', reason);
  }
  return this.save();
};

// Instance method to freeze escrow (for disputes)
escrowSchema.methods.freeze = async function () {
  if (!['FUNDED', 'LOCKED'].includes(this.status)) {
    throw new Error(`Cannot freeze escrow in ${this.status} status`);
  }
  this.status = 'DISPUTED';
  return this.save();
};

// Static method to get escrows by contract
escrowSchema.statics.getByContract = async function (contractId) {
  return this.find({ contractId }).sort({ createdAt: -1 });
};

// Static method to get escrow by milestone
escrowSchema.statics.getByMilestone = async function (contractId, milestoneId) {
  return this.findOne({ contractId, milestoneId });
};

const Escrow = mongoose.model('Escrow', escrowSchema);

export default Escrow;

