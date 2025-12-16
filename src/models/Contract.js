import mongoose from 'mongoose';

const milestoneSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    dueDate: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed', 'disputed'],
      default: 'pending',
    },
    completedAt: {
      type: Date,
    },
    notes: {
      type: String,
    },
  },
  { timestamps: true }
);

const contractSchema = new mongoose.Schema(
  {
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Job',
      required: true,
      index: true,
    },
    proposal: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Proposal',
      required: true,
      index: true,
    },
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    freelancer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: [
        'pending',
        'active',
        'completed',
        'cancelled',
        'disputed',
        'terminated',
      ],
      default: 'pending',
      index: true,
    },
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
    },
    deadline: {
      type: Date,
    },
    milestones: [milestoneSchema],
    terms: {
      type: String,
    },
    paymentType: {
      type: String,
      enum: ['fixed', 'hourly', 'milestone'],
      default: 'fixed',
    },
    hourlyRate: {
      type: Number,
      min: 0,
    },
    estimatedHours: {
      type: Number,
      min: 0,
    },
    actualHours: {
      type: Number,
      min: 0,
      default: 0,
    },
    completedAt: {
      type: Date,
    },
    cancelledAt: {
      type: Date,
    },
    cancellationReason: {
      type: String,
    },
    cancelledBy: {
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
  }
);

// Indexes for performance
contractSchema.index({ client: 1, status: 1, createdAt: -1 });
contractSchema.index({ freelancer: 1, status: 1, createdAt: -1 });
contractSchema.index({ job: 1 });
contractSchema.index({ proposal: 1 }, { unique: true });

// Virtual for conversation
contractSchema.virtual('conversation', {
  ref: 'Conversation',
  localField: '_id',
  foreignField: 'contract',
  justOne: true,
});

// Methods
contractSchema.methods.canBeModifiedBy = function (userId) {
  return (
    this.client.toString() === userId.toString() ||
    this.freelancer.toString() === userId.toString()
  );
};

contractSchema.methods.isActive = function () {
  return this.status === 'active';
};

contractSchema.methods.canAddMilestone = function () {
  return ['pending', 'active'].includes(this.status);
};

contractSchema.methods.calculateProgress = function () {
  if (!this.milestones || this.milestones.length === 0) return 0;
  const completed = this.milestones.filter(
    (m) => m.status === 'completed'
  ).length;
  return (completed / this.milestones.length) * 100;
};

// Statics
contractSchema.statics.findByUser = function (userId, options = {}) {
  const query = {
    $or: [{ client: userId }, { freelancer: userId }],
  };
  if (options.status) query.status = options.status;
  return this.find(query).sort({ createdAt: -1 });
};

contractSchema.statics.findActiveByUser = function (userId) {
  return this.find({
    $or: [{ client: userId }, { freelancer: userId }],
    status: 'active',
  }).sort({ createdAt: -1 });
};

// Pre-save hook
contractSchema.pre('save', function (next) {
  if (this.isModified('status') && this.status === 'active' && !this.startDate) {
    this.startDate = new Date();
  }
  if (this.isModified('status') && this.status === 'completed' && !this.completedAt) {
    this.completedAt = new Date();
  }
  next();
});

const Contract = mongoose.model('Contract', contractSchema);

export default Contract;
