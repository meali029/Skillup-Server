import mongoose from 'mongoose';
import {
  CONTRACT_STATUS,
  MILESTONE_STATUS,
  PAYMENT_TYPE,
  MILESTONE_EDITABLE_STATUSES,
  isStatusTransitionAllowed,
} from '../modules/contracts/contract.constants.js';

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
      enum: Object.values(MILESTONE_STATUS),
      default: MILESTONE_STATUS.PENDING,
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
      enum: Object.values(CONTRACT_STATUS),
      default: CONTRACT_STATUS.PENDING,
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
      enum: Object.values(PAYMENT_TYPE),
      default: PAYMENT_TYPE.FIXED,
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
    paymentStatus: {
      type: String,
      enum: ['PENDING', 'COMPLETED', 'FAILED'],
      default: 'PENDING',
      index: true,
    },
    initialEscrowId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Escrow',
      index: true,
    },
    paymentTransactionId: {
      type: String,
      index: true,
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

/**
 * Check if a user can VIEW the contract (read-only access)
 * Business Rule: Both client and freelancer can view their contracts
 * Handles both populated (User object) and unpopulated (ObjectId) cases
 * @param {string|ObjectId} userId - The user ID to check
 * @returns {boolean} - Whether the user can view the contract
 */
contractSchema.methods.canBeViewedBy = function (userId) {
  if (!userId || !this.client || !this.freelancer) return false;
  
  // Safely extract IDs - handle both ObjectId and populated User documents
  const userIdStr = userId.toString();
  const clientIdStr = (this.client._id || this.client).toString();
  const freelancerIdStr = (this.freelancer._id || this.freelancer).toString();
  
  return clientIdStr === userIdStr || freelancerIdStr === userIdStr;
};

/**
 * Check if a user can MODIFY the contract (write access)
 * Business Rule: Both client and freelancer can modify their contracts
 * Note: Specific modifications may have additional role-based restrictions
 * Handles both populated (User object) and unpopulated (ObjectId) cases
 * @param {string|ObjectId} userId - The user ID to check
 * @returns {boolean} - Whether the user can modify the contract
 */
contractSchema.methods.canBeModifiedBy = function (userId) {
  if (!userId || !this.client || !this.freelancer) return false;
  
  // Safely extract IDs - handle both ObjectId and populated User documents
  const userIdStr = userId.toString();
  const clientIdStr = (this.client._id || this.client).toString();
  const freelancerIdStr = (this.freelancer._id || this.freelancer).toString();
  
  return clientIdStr === userIdStr || freelancerIdStr === userIdStr;
};

contractSchema.methods.isActive = function () {
  return this.status === CONTRACT_STATUS.ACTIVE;
};

/**
 * Check if milestones can be added to this contract
 * Business Rule: Milestones can only be added when contract is pending or active
 */
contractSchema.methods.canAddMilestone = function () {
  return MILESTONE_EDITABLE_STATUSES.includes(this.status);
};

/**
 * Validate if a status transition is allowed
 * Business Rule: Enforces state machine - certain transitions are forbidden
 * @param {string} newStatus - The desired new status
 * @returns {boolean} - Whether the transition is allowed
 */
contractSchema.methods.canTransitionTo = function (newStatus) {
  return isStatusTransitionAllowed(this.status, newStatus);
};

/**
 * Check if the client is the given user
 * Handles both populated (User object) and unpopulated (ObjectId) cases
 */
contractSchema.methods.isClient = function (userId) {
  if (!this.client || !userId) return false;
  const clientIdStr = (this.client._id || this.client).toString();
  const userIdStr = userId.toString();
  return clientIdStr === userIdStr;
};

/**
 * Check if the freelancer is the given user
 * Handles both populated (User object) and unpopulated (ObjectId) cases
 */
contractSchema.methods.isFreelancer = function (userId) {
  if (!this.freelancer || !userId) return false;
  const freelancerIdStr = (this.freelancer._id || this.freelancer).toString();
  const userIdStr = userId.toString();
  return freelancerIdStr === userIdStr;
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
    status: CONTRACT_STATUS.ACTIVE,
  }).sort({ createdAt: -1 });
};

// Pre-save hook to enforce business rules and auto-populate fields
contractSchema.pre('save', function (next) {
  // Business Rule: Auto-set startDate when contract becomes active
  if (this.isModified('status') && this.status === CONTRACT_STATUS.ACTIVE && !this.startDate) {
    this.startDate = new Date();
  }
  
  // Business Rule: Auto-set completedAt when contract is completed
  if (this.isModified('status') && this.status === CONTRACT_STATUS.COMPLETED && !this.completedAt) {
    this.completedAt = new Date();
  }
  
  // Business Rule: Validate endDate is not before startDate
  if (this.endDate && this.startDate && this.endDate < this.startDate) {
    return next(new Error('End date cannot be before start date'));
  }
  
  // Business Rule: Auto-set milestone completedAt when status changes to completed
  if (this.isModified('milestones')) {
    this.milestones.forEach((milestone) => {
      if (milestone.status === MILESTONE_STATUS.COMPLETED && !milestone.completedAt) {
        milestone.completedAt = new Date();
      }
    });
  }
  
  next();
});

const Contract = mongoose.model('Contract', contractSchema);

export default Contract;
