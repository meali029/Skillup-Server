import mongoose from 'mongoose';

const disputeSchema = new mongoose.Schema(
  {
    disputeId: {
      type: String,
      required: true,
      unique: true,
      default: () => new mongoose.Types.ObjectId().toString(),
    },
    contractId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Contract',
      index: true,
    },
    raisedBy: {
      type: String,
      required: true,
      enum: ['client', 'freelancer'],
    },
    raisedByUserId: {
      type: String,
      required: true,
      ref: 'User',
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['OPEN', 'RESOLVED', 'REJECTED'],
      default: 'OPEN',
      index: true,
    },
    resolution: {
      type: String,
      trim: true,
    },
    resolvedBy: {
      type: String,
      ref: 'User',
    },
    resolvedAt: {
      type: Date,
    },
    evidence: [
      {
        type: {
          type: String,
          enum: ['image', 'document', 'link'],
        },
        url: String,
        description: String,
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    adminNotes: [
      {
        note: String,
        addedBy: {
          type: String,
          ref: 'User',
        },
        addedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for efficient queries
disputeSchema.index({ status: 1, createdAt: -1 });
disputeSchema.index({ contractId: 1, status: 1 });
disputeSchema.index({ raisedByUserId: 1 });

// Virtual populate for contract details
disputeSchema.virtual('contract', {
  ref: 'Contract',
  localField: 'contractId',
  foreignField: '_id',
  justOne: true,
});

// Virtual populate for user who raised the dispute
disputeSchema.virtual('raisedByUser', {
  ref: 'User',
  localField: 'raisedByUserId',
  foreignField: '_id',
  justOne: true,
});

// Static method to get disputes with filters
disputeSchema.statics.getDisputes = async function (filters = {}, options = {}) {
  const {
    status,
    contractId,
    raisedBy,
    page = 1,
    limit = 10,
    sortBy = '-createdAt',
  } = options;

  const query = { ...filters };

  if (status) query.status = status;
  if (contractId) query.contractId = contractId;
  if (raisedBy) query.raisedBy = raisedBy;

  const skip = (page - 1) * limit;

  const [disputes, total] = await Promise.all([
    this.find(query)
      .populate('contract')
      .populate('raisedByUser', 'name email profilePicture')
      .populate('resolvedBy', 'name email')
      .sort(sortBy)
      .skip(skip)
      .limit(limit)
      .lean(),
    this.countDocuments(query),
  ]);

  return {
    disputes,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

// Instance method to resolve dispute
disputeSchema.methods.resolve = async function (resolution, adminId) {
  this.status = 'RESOLVED';
  this.resolution = resolution;
  this.resolvedBy = adminId;
  this.resolvedAt = new Date();
  return this.save();
};

// Instance method to reject dispute
disputeSchema.methods.reject = async function (reason, adminId) {
  this.status = 'REJECTED';
  this.resolution = reason;
  this.resolvedBy = adminId;
  this.resolvedAt = new Date();
  return this.save();
};

// Instance method to add admin note
disputeSchema.methods.addAdminNote = async function (note, adminId) {
  this.adminNotes.push({
    note,
    addedBy: adminId,
    addedAt: new Date(),
  });
  return this.save();
};

const Dispute = mongoose.model('Dispute', disputeSchema);

export default Dispute;
